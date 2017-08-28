import XMap from './xmap';
import XSet from './xset';

const GET_SET = Symbol('getSet');

export default class XMultiMap extends XMap{
    constructor(...entries){
        super();

        for(let [key, values] of entries)
            this.addAll(key, values);
    }

    [GET_SET](key){
        let set = this.get(key);
        if(!set){
            set = new XSet();
            this.set(key, set);
        }
        return set;
    }

    addEmpty(key){
        this[GET_SET](key);
    }

    add(key, value){
        return this[GET_SET](key).add(value);
    }

    addAll(key, values){
        return this[GET_SET](key).addAll(values);
    }

    remove(key, value){
        return this[GET_SET](key).remove(value);
    }

    removeAll(key, values){
        return this[GET_SET](key).removeAll(values);
    }

    addFrom(map){
        let result = false;
        for(let [key, values] of map)
            result |= this.addAll(key, values);
        return result;
    }

    removeFrom(map){
        let result = false;
        for(let [key, values] of map)
            result |= this.removeAll(key, values);
        return result;
    }
}