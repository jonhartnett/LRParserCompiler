import XMultiMap from './xmultimap';
import XMap from './xmap';
import XSet from './xset';
import XDeltaSet from './xdeltaset';
import XDeltaMap from './xdeltamap';
import {map, entries, kfilter, hash, peek} from './util';
import {inspect} from 'util';
import uuid from 'uuid/v4';

const INVALID = Symbol('invalid');
const SHIFT = 's';
const ACCEPT = 'a';
const REDUCE = 'r';
const LEAF = Symbol('leaf');

const START = Symbol.for('START');

const regexLookup = Object.create(null);

function regex(body, flags=''){
    let key = body + '/' + flags;
    if(key in regexLookup)
        return regexLookup[key];
    else
        return regexLookup[key] = new RegExp(body, flags);
}

export default class LR1{
    static QFParser = LR1.load(require('../qf-meta'));

    static create(src){
        let grammar = LR1.QFParser(src);
        let terminals = new XSet(null);
        let nonTerminals = new XSet();
        let inlineNonTerminals = new XSet();
        let ranks = new XMap();

        let rules = LR1.traverse(grammar, function*(type, ...children){
            switch(type){
                case 'nonTerminal':{
                    let [name] = children;
                    let sym = Symbol.for(name);
                    nonTerminals.add(sym);
                    yield sym;
                    break;
                }
                case 'terminal':{
                    let [value] = children;
                    switch(value[0]){
                        case `"`:
                        case `'`:{
                            let hidden = (value[0] === `'`);
                            value = value.slice(1, -1);
                            value = value.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
                            if(hidden)
                                value = regex(`^\\s*${value}`);
                            else
                                value = regex(`^\\s*(${value})`);
                            break;
                        }
                        case `/`:{
                            let [, body, flags] = /^\/((?:[^\\\/]|\\[\s\S])*)\/([A-Za-z]*)$/.exec(value);
                            value = regex(`^\\s*${body}`, flags);
                            break;
                        }
                    }
                    terminals.add(value);
                    yield value;
                    break;
                }
                case 'or':
                case 'and':{
                    let [left,right] = children;
                    let node = [type];
                    addSub(left);
                    addSub(right);
                    yield node;

                    function addSub(sub){
                        if(sub instanceof Array && sub[0] === type)
                            node.push(...sub.slice(1));
                        else
                            node.push(sub);
                    }
                    break;
                }
                case 'optional':{
                    let [value] = children;
                    yield ['or', value, null];
                    break;
                }
                case 'zeroRepeat':
                case 'oneRepeat':{
                    let [value] = children;
                    let key = Symbol.for(uuid());

                    inlineNonTerminals.add(key);
                    nonTerminals.add(key);

                    let end = (type === 'oneRepeat') ? value : null;

                    grammar.push([
                        key, ...flatten(['or', end, ['and', value, key]])
                    ]);
                    yield key;
                    break;
                }
                case 'rule':{
                    let key, value;
                    if(children.length === 3){
                        [key,,value] = children;
                        inlineNonTerminals.add(key);
                    }else{
                        [key,value] = children;
                    }
                    yield [key, ...flatten(value)];
                    break;
                }
                case 'grammar':{
                    let rules = children.map(rule => {
                        let [key, ...values] = rule;
                        let i = 0;
                        for(let value of values)
                            ranks.set([key, hash(value)], i++);
                        return [key, values];
                    });
                    yield new XMultiMap(...rules);
                    break;
                }
                default:{
                    yield [type, ...children];
                    break;
                }
            }
        });

        if(!nonTerminals.has(START))
            throw new Error('Grammar is missing a START non-terminal.');

        function* flatten(value){
            if(value instanceof Array){
                let [type, ...args] = value;
                switch(type){
                    case 'or':
                        for(let arg of args)
                            yield* flatten(arg);
                        break;
                    case 'and':
                        let arr = [];
                        for(let arg of args)
                            arr.push([...flatten(arg)]);
                        yield* combos(0);

                    function* combos(index){
                        if(index === arr.length - 1){
                            for(let part of arr[index])
                                yield part;
                        }else{
                            for(let combo of combos(index + 1))
                                for(let part of arr[index])
                                    yield [...part, ...combo];
                        }
                    }
                }
            }else{
                if(value === null)
                    yield [];
                else
                    yield [value];
            }
        }

        let lr = new LR1();
        lr.rules = rules;
        lr.terminals = terminals;
        lr.nonTerminals = nonTerminals;
        lr.inlineNonTerminals = inlineNonTerminals;
        lr.tokens = new XSet(...terminals, ...nonTerminals);
        lr.ranks = ranks;
        lr.COMPUTE_FIRSTS();
        return lr;
    }
    static load(compressed){
        if(typeof compressed === 'string')
            compressed = JSON.parse(compressed);
        function toToken(value){
            if(value == null){
                return null;
            }else
            if(typeof value === 'string'){
                return value;
            }else{
                let [type, str] = value;
                switch(type){
                    case 'r':
                        let m = /^\/([\s\S]+)\/([a-z]*)/.exec(str);
                        return new RegExp(m[1], m[2]);
                    case 's':
                        return Symbol.for(str);
                    default:
                        throw new Error(type);
                }
            }
        }
        function toAction([type, arg1, arg2, arg3]){
            switch(type){
                case 's':
                    return [SHIFT, arg1];
                case 'r':
                    return [REDUCE, toToken(arg1), arg2, arg3];
                case 'a':
                    return [ACCEPT, toToken(arg1), arg2, arg3];
                default:
                    throw new Error();
            }
        }

        let key, value;
        let actions = new XMultiMap();
        for(let id = 0; id < compressed.actions.length; id++){
            let entries = compressed.actions[id];
            if(!(entries instanceof Array))
                continue;
            for(let entry of entries){
                let [tok, ...action] = entry;

                key = [id, toToken(tok)];
                value = action::map(toAction);

                actions.addAll(key, value);
            }
        }

        let gotos = new XMap();
        for(let id = 0; id < compressed.gotos.length; id++){
            let entries = compressed.gotos[id];
            if(!(entries instanceof Array))
                continue;
            for(let entry of entries){
                if(entry === 0)
                    continue;
                let [tok, id2] = entry;

                key = [id, toToken(tok)];
                value = id2;

                gotos.set(key, value);
            }
        }

        let terminals = new XSet();
        for(let tok of compressed.terminals){
            value = toToken(tok);
            terminals.add(value);
        }

        let inlines = new XSet();
        for(let tok of compressed.inlines)
            inlines.add(Symbol.for(tok));

        let tokens = new XMultiMap();
        for(let [state, tok] of actions.keys())
            tokens.add(state, tok);

        let lr = new LR1();
        lr.built = true;
        lr.ACTION_TABLE = actions;
        lr.GOTO_TABLE = gotos;
        lr.TOKEN_TABLE = tokens;
        lr.terminals = terminals;
        lr.inlineNonTerminals = inlines;
        return lr;
    }

    static traverse(tree, visitor){
        let result = [...handle(tree, visitor)];
        if(result.length === 1)
            result = result[0];
        return result;

        function handle(tree, visitor){
            let [type, ...children] = tree;
            tree.splice(0, tree.length);
            for(let child of children){
                if(child instanceof Array){
                    child.parent = tree;
                    tree.push(...handle(child, visitor));
                    delete child.parent;
                }else{
                    tree.push(child);
                }
            }

            return tree::visitor(type, ...tree);
        }
    }

    constructor(){
        //make this callable
        let inst = (...args) => inst.parse(...args);
        inst.__proto__ = this.__proto__;
        return inst;
    }

    save(){
        if(!this.built)
            this.BUILD();
        function fromToken(tok){
            if(tok === null)
                return null;
            else
            if(tok instanceof RegExp)
                return ['r', tok.toString()];
            else
            if(typeof tok === 'string')
                return tok;
            else
            if(typeof tok === 'symbol')
                return ['s', Symbol.keyFor(tok)];
        }
        function fromAction([type, arg1, arg2, arg3]){
            switch(type){
                case SHIFT:
                    return ['s', arg1];
                case REDUCE:
                    return ['r', fromToken(arg1), arg2, arg3];
                case ACCEPT:
                    return ['a', fromToken(arg1), arg2, arg3];
                default:
                    throw new Error();
            }
        }

        let actions = [];
        for(let entry of this.ACTION_TABLE){
            let [[id, tok], action] = entry;

            let arr = actions[id];
            if(!arr)
                arr = actions[id] = [];

            let value = [fromToken(tok), ...action::map(fromAction)];

            arr.push(value);
        }
        //replace null with 0 because it's shorter
        actions = actions.map(action => action === null ? 0 : action);

        let gotos = [];
        for(let entry of this.GOTO_TABLE){
            let [[id, tok], id2] = entry;

            let arr = gotos[id];
            if(!arr)
                arr = gotos[id] = [];

            let value = [fromToken(tok), id2];

            arr.push(value);
        }
        //replace null with 0 because it's shorter
        gotos = gotos.map(goto => goto === null ? 0 : goto);

        let terminals = [];
        for(let tok of this.terminals){
            let value = fromToken(tok);
            terminals.push(value);
        }

        let inlines = [];
        for(let tok of this.inlineNonTerminals)
            inlines.push(Symbol.keyFor(tok));

        return JSON.stringify({
            actions,
            gotos,
            terminals,
            inlines
        });
    }

    COMPUTE_FIRSTS(){
        this.FIRSTS = new XMultiMap();
        for(let term of this.terminals)
            this.FIRSTS.add(term, term);
        for(let non of this.nonTerminals)
            this.FIRSTS.addEmpty(non);

        let change = true;
        while(change){
            change = false;
            for(let [key, values] of this.rules){
                let set = this.FIRSTS.get(key);
                for(let value of values){
                    let broken = false;
                    for(let part of value){
                        let set2 = this.FIRSTS.get(part);
                        change |= set.addAll(set2);
                        if(!set2.has(null)){
                            broken = true;
                            break;
                        }
                    }
                    if(!broken)
                        change |= set.add(null);
                }
            }
        }
    }
    FIRST(...values){
        let set = new XSet();
        let broken = false;
        for(let value of values){
            let set2 = this.FIRSTS.get(value);
            set.addAll(set2);
            if(!set2.has(null)){
                broken = true;
                break;
            }
        }
        if(!broken)
            set.add(null);
        return set;
    }
    CLOSURE(...items){
        items = new XDeltaSet(...items);
        for(let [key, left, right, lookahead] of items.changes()){
            if(right.length === 0)
                continue;
            let first;
            [first, ...right] = right;
            if(typeof first === 'symbol'){
                let lookaheads = this.FIRST(...right, lookahead);
                for(let value of this.rules.get(first)){
                    for(let lookahead of lookaheads)
                        items.add([first, [], value, lookahead]);
                }
            }
        }
        return new XSet(...items);
    }
    GOTO(items, value){
        let newItems = new XSet();
        for(let [key, left, right, lookahead] of items){
            if(right.length === 0)
                continue;
            let first;
            [first, ...right] = right;
            if(first === value)
                newItems.add([key, [...left, first], right, lookahead]);
        }
        return this.CLOSURE(...newItems);
    }

    BUILD_STATES_AND_TRANSITIONS(){
        let s0 = this.CLOSURE(
            ...this.rules.get(START)::map(value =>
                [START, [], value, null]
            )
        );
        let states = new XDeltaMap();
        let transitions = new XMap();

        states.set(s0, 0);
        for(let [state, id] of states.changes()){
            for(let value of this.tokens){
                let newState = this.GOTO(state, value);
                if(newState.length === 0)
                    continue;
                let newID = states.get(newState);
                if(newID === undefined){
                    newID = states.length;
                    states.set(newState, newID);
                }
                transitions.set([id, value], newID);
            }
        }

        return [states, transitions];
    }
    BUILD_ACTION_AND_GOTO(){
        let [states, transitions] = this.BUILD_STATES_AND_TRANSITIONS();

        let actionTable = new XMultiMap();
        let gotoTable = new XMap();
        for(let [state, id] of states){
            for(let [key, left, right, lookahead] of state){
                if(right.length !== 0){
                    let [first] = right;
                    if(typeof first === 'string' || first instanceof RegExp){
                        let k = transitions.get([id, first]);
                        if(k !== undefined)
                            actionTable.add([id, first], [SHIFT, k]);
                    }
                }else
                if(key === START && lookahead === null){
                    let rank = this.ranks.get([key, hash(left)]);
                    if(rank === undefined)
                        throw new Error();
                    actionTable.add([id, null], [ACCEPT, key, left.length, rank]);
                }else{
                    let rank = this.ranks.get([key, hash(left)]);
                    if(rank === undefined)
                        throw new Error();
                    actionTable.add([id, lookahead], [REDUCE, key, left.length, rank]);
                }
            }
            for(let non of this.nonTerminals){
                let k = transitions.get([id, non]);
                if(k !== undefined)
                    gotoTable.set([id, non], k);
            }
        }
        return [actionTable, gotoTable];
    }
    BUILD(){
        let [ACTION, GOTO] = this.BUILD_ACTION_AND_GOTO();
        let TOKENS = new XMultiMap();
        for(let [state, tok] of ACTION.keys())
            TOKENS.add(state, tok);

        this.built = true;
        this.ACTION_TABLE = ACTION;
        this.GOTO_TABLE = GOTO;
        this.TOKEN_TABLE = TOKENS;
    }

    parse(src){
        if(!this.built)
            this.BUILD();

        let context = {states: [INVALID, 0], nodes: [], src};

        while(!context.done){
            context = this::step(context);
            if(context instanceof Error)
                throw context;
        }

        let root = context.nodes[0];

        let thiz = this;
        root = LR1.traverse(root, function*(type, ...children){
            if(thiz.inlineNonTerminals.has(Symbol.for(type))){
                yield* children;
            }else{
                yield [type, ...children];
            }
        });

        return root;

        function step(...contexts){
            if(contexts.length === 1){
                let [context] = contexts;
                let {states, nodes, src} = context;
                let state = states::peek();

                let options = [];
                let tokens = this.TOKEN_TABLE.get(state);
                if(!tokens)
                    tokens = [];
                for(let token of tokens){
                    if(token === null){
                        if(/^\s*$/.test(src)){
                            options.push([
                                null,
                                [LEAF, null],
                                0
                            ]);
                        }
                    }else
                    if(token instanceof RegExp){
                        let match = token.exec(src);
                        if(match !== null){
                            options.push([
                                token,
                                [LEAF, ...match.slice(1)],
                                match[0].length
                            ]);
                        }
                    }else{
                        if(src.startsWith(token)){
                            options.push([
                                token,
                                [LEAF, token],
                                token.length
                            ]);
                        }
                    }
                }

                let newContexts = [];
                let actions = new XSet();
                for(let [token, leaf, length] of options){
                    for(let action of this.ACTION_TABLE.get([state, token])){
                        if(action[0] === SHIFT)
                            actions.add([...action, leaf, length]);
                        else
                            actions.add(action);
                    }
                }

                for(let [type, arg1, arg2, arg3] of actions){
                    let newContext;
                    //reuse context if only one
                    if(actions.length === 1)
                        newContext = context;
                    else
                        newContext = {states: [...states], nodes: [...nodes], src};
                    let node;
                    switch(type){
                        case SHIFT:
                            newContext.src = newContext.src.substring(arg3);
                            newContext.states.push(arg1);
                            newContext.nodes.push(arg2);
                            break;
                        case REDUCE:
                            node = this::createNode(newContext, /*key*/arg1, /*length*/arg2, /*rank*/arg3);
                            newContext.states.splice(newContext.states.length - arg2, arg2);
                            let newState = newContext.states::peek();
                            let goto = this.GOTO_TABLE.get([newState, arg1]);
                            if(goto === undefined)
                                throw new Error(`Missing goto for (${newState},${Symbol.keyFor(arg1)})!`);
                            newContext.states.push(goto);
                            newContext.nodes.push(node);
                            break;
                        case ACCEPT:
                            node = this::createNode(newContext, /*key*/arg1, /*length*/arg2, /*rank*/arg3);
                            newContext.done = true;
                            newContext.nodes.push(node);
                    }
                    newContexts.push(newContext);
                }

                switch(newContexts.length){
                    //branch erred out
                    case 0:
                        let i = src.indexOf('\n');
                        if(i < 0)
                            i += src.length;
                        let line = `"${src}"`;
                        return new ExpectedError(line, ...tokens);
                    //return the single canonical context
                    case 1:
                        return newContexts[0];
                    //step as a group to resolve the ambiguity
                    default:
                        return this::step(...newContexts);
                }
            }else{
                if(contexts.length === 0)
                    throw new Error('No contexts');

                while(true){
                    let [deltas, others] = getExtremes(contexts, context => context.src.length, false);
                    if(deltas.length > 1){
                        let others2;
                        [deltas, others2] = getExtremes(deltas, context => context.states.length, false);
                        others.push(...others2);
                    }

                    //if they are all identical, check for identical state stacks
                    if(others.length === 0){
                        let [first, ...rest] = deltas;
                        let exact = true;
                        let code = hash(first.states);
                        for(let context of rest){
                            if(hash(context.states) !== code){
                                exact = false;
                                break;
                            }
                        }
                        if(exact)
                            break;
                    }

                    //step all the deltas
                    let errs = [];
                    for(let context of deltas){
                        context = this::step(context);
                        if(context instanceof Error)
                            errs.push(context);
                        else
                            others.push(context);
                    }
                    if(others.length === 0){
                        let tokens = [];
                        for(let err of errs)
                            tokens.push(...err.tokens);
                        return new ExpectedError(errs[0].line, ...tokens);
                    }
                    contexts = others;
                }

                if(contexts.length > 1){
                    try{
                        let mins = [];
                        for(let context of contexts){
                            let min = mins[0];
                            if(min === undefined){
                                mins.push(context);
                                continue;
                            }
                            let cmp = compareArr(context.nodes, min.nodes);
                            if(cmp < 0)
                                mins = [context];
                            else
                            if(cmp === 0)
                                mins.push(context);
                        }
                        contexts = mins;
                    }catch(err){
                        if(!(err instanceof Error))
                            err = new Error('');
                        let msg = 'Failed to resolve ambiguity:\n';
                        msg += inspect(contexts, {depth: null});
                        err.message = `${msg}\n${err.message}`;
                        throw err;
                    }
                }

                function compareArr(arr1, arr2){
                    for(let i = 0; i < arr1.length; i++){
                        let cmp = compare(arr1[i], arr2[i]);
                        if(cmp !== 0)
                            return cmp;
                    }
                    return 0;
                }
                function compare(n1, n2){
                    if(typeof n1 !== typeof n2)
                        throw null;
                    if(typeof n1 === 'string')
                        return 0;
                    if(n1.key !== n2.key)
                        throw null;
                    if(n1.rank !== n2.rank)
                        return Math.sign(n1.rank - n2.rank);
                    //we can loop simply based on n1 here because
                    //  n1.length === n2.length if n1.rank === n2.rank
                    for(let i = 0; i < n1.length; i++){
                        let cmp = compare(n1[i], n2[i]);
                        if(cmp !== 0)
                            return cmp;
                    }
                    return 0;
                }

                return contexts[0];
            }
        }

        function getExtremes(contexts, scorer, findMins=false){
            let extremes = [];
            let extremeScore = findMins ? Infinity : -Infinity;
            let others = [];

            for(let context of contexts){
                let score = scorer(context);

                if(score === extremeScore){
                    extremes.push(context);
                }else
                if((score < extremeScore) === findMins){
                    others.push(...extremes);
                    extremes = [context];
                    extremeScore = score;
                }else{
                    others.push(context);
                }
            }

            return [extremes, others];
        }
        function createNode(context, key, length, rank){
            let node = [];
            node.key = key;
            node.rank = rank;
            for(let i = 0; i < length; i++){
                let child = context.nodes.pop();
                if(child instanceof Array && child[0] === LEAF){
                    node.unshift(...child.slice(1));
                }else{
                    node.unshift(child);
                }
            }
            node.unshift(Symbol.keyFor(key));
            return node;
        }
    }
}

class ExpectedError extends SyntaxError{
    constructor(line, ...tokens){
        super(`\nExpected:\n${tokens}\n${line}`);
        this.line = line;
        this.tokens = tokens;
    }
}