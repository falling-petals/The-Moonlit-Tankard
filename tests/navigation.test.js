import test from 'node:test';
import assert from 'node:assert/strict';
import {findPath,isWalkable,nearestWalkable,navigationObstacles} from '../src/navigation.js';
const entry={x:768,y:900};
function safePath(start,path,options={}){for(const end of path){const d=Math.hypot(end.x-start.x,end.y-start.y);for(let n=0;n<=Math.ceil(d);n++){const t=n/Math.max(1,Math.ceil(d));assert.ok(isWalkable({x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t},options));}start=end;}}
test('entry reaches all service points and bar without crossing furniture',()=>{for(const end of [{x:420,y:570},{x:1110,y:570},{x:420,y:805},{x:1110,y:805},{x:790,y:185},{x:200,y:400}]){const path=findPath(entry,end);assert.ok(path.length);assert.deepEqual(path.at(-1),end);safePath(entry,path);}});
test('table forces a real detour',()=>{const start={x:420,y:360},end={x:420,y:570};const path=findPath(start,end);assert.ok(path.some(p=>Math.abs(p.x-420)>90));safePath(start,path);});
test('blocked and outside targets snap safely',()=>{for(const end of [{x:420,y:470},{x:-10000,y:20000}]){const path=findPath(entry,end);assert.ok(path.length);assert.ok(isWalkable(path.at(-1)));safePath(entry,path);}assert.ok(navigationObstacles().length>=13);assert.ok(isWalkable(nearestWalkable({x:420,y:470})));});
test('custom bounds, unreachable barrier, equal and invalid inputs',()=>{const options={bounds:{x:0,y:0,width:100,height:100},obstacles:[{x:40,y:0,width:20,height:100}]};assert.deepEqual(findPath({x:10,y:50},{x:90,y:50},options),[]);assert.deepEqual(findPath(entry,entry),[]);for(const p of [null,{}, {x:NaN,y:1},{x:Infinity,y:1},{x:'1',y:2}]){assert.deepEqual(findPath(entry,p),[]);assert.equal(isWalkable(p),false);assert.equal(nearestWalkable(p),null);}});
