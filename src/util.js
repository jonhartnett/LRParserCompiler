import {inspect} from 'util';

export const CONSTRUCTABLE = Symbol('constructable');
export const INSPECT = inspect.custom;

export function peek(){
    return this[this.length - 1];
}

export function* entries(){
    for(let key of Object.getOwnPropertyNames(this))
        yield [key, this[key]];
    for(let key of Object.getOwnPropertySymbols(this))
        yield [key, this[key]];
}

export function map(func, thiz=undefined){
    if(this == null)
        throw new Error(`Invalid this: ${this}`);
    if(typeof func !== 'function')
        throw new Error(`Invalid callback: ${func}`);
    let arr = [];
    let i = 0;
    for(let value of this)
        arr.push(thiz::func(value, i++));

    let con = this.constructor;
    if(con && con[CONSTRUCTABLE]){
        return new con(...arr);
    }else{
        return arr;
    }
}
export function filter(func, thiz=undefined){
    if(this == null)
        throw new Error(`Invalid this: ${this}`);
    if(typeof func !== 'function')
        throw new Error(`Invalid callback: ${func}`);
    let arr = [];
    let i = 0;
    for(let value of this)
        if(thiz::func(value, i++))
            arr.push(value);

    let con = this.constructor;
    if(con && con[CONSTRUCTABLE]){
        return new con(...arr);
    }else{
        return arr;
    }
}
export function reduce(func, initial=undefined, thiz=undefined){
    if(this == null)
        throw new Error(`Invalid this: ${this}`);
    if(typeof func !== 'function')
        throw new Error(`Invalid callback: ${func}`);
    let iterator = this[Symbol.iterator]();
    let result = initial;
    if(result === undefined){
        let done;
        ({done, value: result} = iterator.next());
        if(done)
            return undefined;
    }
    for(let value of iterator)
        result = thiz::func(result, value);
    return result;
}

export function kmap(func, thiz=undefined){
    if(this == null)
        throw new Error(`Invalid this: ${this}`);
    if(typeof func !== 'function')
        throw new Error(`Invalid callback: ${func}`);
    let iterable = (this[Symbol.iterator] ? this : this::entries());
    let arr = [];
    for(let [key, value] of iterable)
        arr.push(thiz::func(key, value));

    let con = this.constructor;
    if(con && con[CONSTRUCTABLE]){
        return new con(...arr);
    }else{
        let obj = Object.create(null);
        for(let [key, value] of arr)
            obj[key] = value;
        return obj;
    }
}
export function kfilter(func, thiz=undefined){
    if(this == null)
        throw new Error(`Invalid this: ${this}`);
    if(typeof func !== 'function')
        throw new Error(`Invalid callback: ${func}`);
    let iterable = (this[Symbol.iterator] ? this : this::entries());
    let arr = [];
    for(let [key, value] of iterable)
        if(thiz::func(key, value))
            arr.push([key, value]);

    let con = this.constructor;
    if(con && con[CONSTRUCTABLE]){
        return new con(...arr);
    }else{
        let obj = Object.create(null);
        for(let [key, value] of arr)
            obj[key] = value;
        return obj;
    }
}
export function kreduce(func, initial=undefined, thiz=undefined){
    if(this == null)
        throw new Error(`Invalid this: ${this}`);
    if(typeof func !== 'function')
        throw new Error(`Invalid callback: ${func}`);
    let iterable = (this[Symbol.iterator] ? this : this::entries());
    let iterator = iterable[Symbol.iterator]();
    let result = initial;
    if(result === undefined){
        let done;
        ({done, value: result} = iterator.next());
        if(done)
            return undefined;
    }
    for(let entry of iterator)
        result = thiz::func(result, entry);
    return result;
}

export const HASH_ITERATOR = Symbol('hashIterator');
export function hash(value){
    let code = 5381;
    for(let char of stream(value))
        code = ((code * 31) + char.charCodeAt(0)) | 0;
    return code;

    function* stream(value){
        if(value == null){
            yield* 'null';
        }else
        if(typeof value === 'number'){
            yield* value.toString();
        }else
        if(typeof value === 'string'){
            yield '"';
            yield* value;
            yield '"';
        }else
        if(value instanceof RegExp){
            yield* value.toString();
        }else
        if(typeof value === 'symbol'){
            yield '<';
            yield* value.toString();
            yield '>';
        }else
        if(value[Symbol.iterator]){
            if(value[HASH_ITERATOR])
                value = value[HASH_ITERATOR]();
            yield '[';
            let first = true;
            for(let part of value){
                if(!first)
                    yield ',';
                yield* stream(part);
                first = false;
            }
            yield ']';
        }else{
            throw new Error(`Invalid value: ${value}`);
        }
    }
}

export function inspectCollection(name, depth, options){
    if(depth < 0)
        return options.stylize(`[${name}]`, 'special');
    const newOptions = Object.assign({}, options);
    if(options.depth !== null)
        newOptions.depth = options.depth - 1;
    const newLine = '\n' + ' '.repeat(5);
    return options.stylize(name, 'special') + inspect([...this], newOptions).replace(/\n/g, newLine);
}