import test from 'node:test';
import assert from 'node:assert/strict';
import {isWalkable,moveWithCollision,findRoute} from '../src/navigation.js';

test('closed checkpoint keeps explorers outside; opening allows entry',()=>{
 const p={x:0,z:30};moveWithCollision(p,0,-8,[],false);assert.ok(p.z>=28.2);
 moveWithCollision(p,0,-8,[],true);assert.ok(p.z<24);
});
test('movement cannot tunnel through a building, even after a long frame',()=>{
 const p={x:0,z:5},wall=[{x:0,z:0,w:8,d:2}];moveWithCollision(p,0,-20,wall);assert.ok(p.z>=1.34);
});
test('diagonal movement slides along walls instead of stopping completely',()=>{
 const p={x:0,z:1.5},wall=[{x:0,z:0,w:8,d:2}];moveWithCollision(p,2,-2,wall);assert.ok(p.x>1.9);assert.ok(p.z>=1.34);
});
test('route goes around a blocked street and ends at the destination',()=>{
 const blocks=[{x:0,z:0,w:8,d:2}],path=findRoute({x:0,z:5},{x:0,z:-5},blocks);
 assert.ok(path.length>10);assert.deepEqual(path.at(-1),{x:0,z:-5});
 assert.ok(path.every(p=>isWalkable(p.x,p.z,blocks,true,.34)));
 const actor={x:0,z:5};for(const waypoint of path){for(let i=0;i<100&&Math.hypot(actor.x-waypoint.x,actor.z-waypoint.z)>.08;i++){const d=Math.hypot(actor.x-waypoint.x,actor.z-waypoint.z);moveWithCollision(actor,(waypoint.x-actor.x)/d*Math.min(.1,d),(waypoint.z-actor.z)/d*Math.min(.1,d),blocks);}}
 assert.ok(Math.hypot(actor.x,actor.z+5)<.1);
});
test('cell boundary allows the entrance bridge but rejects walking out elsewhere',()=>{
 assert.equal(isWalkable(0,33,[]),true);assert.equal(isWalkable(6,32,[]),false);assert.equal(isWalkable(32,0,[]),false);
 const p={x:29,z:0};moveWithCollision(p,30,0,[]);assert.ok(p.x<31);
});
