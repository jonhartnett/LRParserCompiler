import {CONSTRUCTABLE, hash, inspectCollection, INSPECT, HASH_ITERATOR} from './util';

const map = Symbol('map');

export default class XSet{
    static [CONSTRUCTABLE] = true;

    constructor(...values){
        this[map] = Object.create(null);
        this.addAll(values);
    }

    get length(){
        return Object.getOwnPropertyNames(this[map]).length;
    }

    has(value){
        return hash(value) in this[map];
    }

    add(value){
        let code = hash(value);
        let existed = code in this[map];
        if(!existed)
            this[map][code] = value;
        return !existed;
    }

    addAll(values){
        let result = false;
        for(let value of values)
            result |= this.add(value);
        return result;
    }

    remove(value){
        let code = hash(value);
        let existed = code in this[map];
        if(existed)
            delete this[map][code];
        return existed;
    }

    removeAll(values){
        let result = false;
        for(let value of values)
            result |= this.remove(value);
        return result;
    }

    * [Symbol.iterator](){
        for(let key in this[map])
            yield this[map][key];
    }

    [INSPECT](...args){
        return this::inspectCollection('XSet', ...args);
    }

    * [HASH_ITERATOR](){
        let props = Object.getOwnPropertyNames(this[map]);
        props.sort();
        for(let key of props)
            yield* this[map][key];
    }
}