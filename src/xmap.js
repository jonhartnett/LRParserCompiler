import {CONSTRUCTABLE, hash, inspectCollection, INSPECT} from './util';

export const map = Symbol('map');

export default class XMap{
    static [CONSTRUCTABLE] = true;

    constructor(...entries){
        this[map] = Object.create(null);

        for(let [key, value] of entries)
            this.set(key, value);
    }

    * keys(){
        for(let [key, value] of this)
            yield key;
    }

    * values(){
        for(let [key, value] of this)
            yield value;
    }

    * entries(){
        for(let [key, value] of this)
            yield [key, value];
    }

    get length(){
        return Object.getOwnPropertyNames(this[map]).length +
            Object.getOwnPropertySymbols(this[map]).length;
    }

    has(key){
        let code = hash(key);
        return code in this[map];
    }

    get(key){
        let code = hash(key);
        if(code in this[map])
            return this[map][code][1];
        else
            return undefined;
    }

    set(key, value){
        let code = hash(key);
        let existed = code in this[map];
        if(value === undefined){
            if(existed)
                delete this[map][code];
        }else{
            this[map][code] = [key, value];
        }
        return existed;
    }

    setFrom(map){
        for(let [key, value] of map)
            this.set(key, value);
    }

    * [Symbol.iterator](){
        for(let key in this[map])
            yield this[map][key];
    }

    [INSPECT](...args){
        return this::inspectCollection('XMap', ...args);
    }
}