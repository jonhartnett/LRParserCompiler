import XMap from './xmap';

const changes = Symbol('changes');

export default class XDeltaMap extends XMap{
    constructor(...values){
        super();
        this[changes] = [];
        this.setFrom(values);
    }

    set(key, value){
        if(!super.set(key, value)){
            this[changes].push([key, value]);
            return false;
        }else{
            return true;
        }
    }

    * changes(){
        while(this[changes].length > 0)
            yield this[changes].shift();
    }
}