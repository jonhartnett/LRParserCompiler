import XSet from './xset';

const changes = Symbol('changes');

export default class XDeltaSet extends XSet{
    constructor(...values){
        super();
        this[changes] = [];
        this.addAll(values);
    }

    add(value){
        if(super.add(value)){
            this[changes].push(value);
            return true;
        }else{
            return false;
        }
    }

    * changes(){
        while(this[changes].length > 0)
            yield this[changes].shift();
    }
}