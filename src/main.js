import LR1 from './lr1-parser';
import {inspect} from 'util';
import {writeFileSync, readFileSync} from 'fs';

//read the grammar from a file
let grammar = readFileSync('./simple.qf', 'utf8');

let lrParser = LR1.create(grammar);

//Saves the state of the parser so it can be resurrected cheaply
//  writeFileSync('../simple-meta.json', lrParser.save());

//Load the state of a previously saved parser
//  lrParser = LR1.load(readFileSync('../simple-meta.json', 'utf8'));

let src = `
begin.
    A = 3.
    B = 6.
    C = A + B.
    D = C - B.
    if D > A:
    begin.
        E = D.
    end.
    else:
    begin.
        E = A.
    end.
    print E.
end.
`;

//parse the source code for the language
let node = lrParser(src);

//print the parsed nodes
log(node);

//perform a transforming traversal of the node tree
node = LR1.traverse(node, function*(type, ...children){
    switch(type){
        case 'identifier':{
            //return the identifier as a string
            yield children[0];
            break;
        }
        case 'number':{
            //return the value as a number
            yield +children[0];
            break;
        }
        case 'condition':{
            let [left, op, right] = children;
            switch(op){
                case '=': op = (a, b) => a === b; break;
                case '>': op = (a, b) => a > b;   break;
                case '<': op = (a, b) => a < b;   break;
            }
            //return a function that evaluates the condition
            yield scope => op(scope(left), scope(right));
            break;
        }
        case 'expression':{
            if(children.length === 3){
                let [left, op, right] = children;
                switch(op){
                    case '+': op = (a, b) => a + b; break;
                    case '-': op = (a, b) => a - b; break;
                    case '*': op = (a, b) => a * b; break;
                    case '/': op = (a, b) => a / b; break;
                }
                //return a function that evaluates the expression
                yield scope => op(scope(left), scope(right));
            }else{
                let [value] = children;
                //return a function that evaluates the expression
                yield scope => scope(value);
            }
            break;
        }
        case 'statement_list':{
            yield scope => {
                for(let child of children){
                    let [type, ...args] = child;
                    switch(type){
                        case 'assignment':{
                            let [iden, exp] = args;
                            let val = exp(scope);
                            scope(iden, val);
                            break;
                        }
                        case 'print':{
                            let [iden] = args;
                            let val = scope(iden);
                            console.log(val);
                            break;
                        }
                        case 'while_loop':{
                            let [cond, body] = args;
                            while(cond(scope))
                                body(scope);
                            break;
                        }
                        case 'if_statement':{
                            let [cond, then, elseThen=null] = args;
                            if(cond(scope))
                                then(scope);
                            else
                            if(elseThen !== null)
                                elseThen(scope);
                            break;
                        }
                    }
                }
            };
            break;
        }
        case 'START':{
            let [body] = children;
            let scopeDictionary = Object.create(null);
            let scope = function(iden, value){
                if(arguments.length === 1){
                    if(typeof iden === 'string')
                        return scopeDictionary[iden];
                    else
                        return iden;
                }else{
                    scopeDictionary[iden] = value;
                }
            };
            yield () => body(scope);
            break;
        }
        default:{
            yield [type, ...children];
            break;
        }
    }
});

console.log();
console.log('START OF INTERPRETATION');
node();
console.log('END OF INTERPRETATION');

function log(...values){
    console.log(
        ...values.map(
            value =>
                inspect(
                    value,
                    {depth: null}
                )
        )
    );
}