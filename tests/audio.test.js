import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../src/audio.js';

test('audio waits for a gesture, consumes effects once, and obeys mute',async()=>{
  const original=globalThis.AudioContext;
  let created=0,tones=0;
  class FakeContext {
    constructor(){created++;this.currentTime=1;this.state='suspended';this.destination={};}
    async resume(){this.state='running';}
    createGain(){return {gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
    createOscillator(){tones++;return {frequency:{setValueAtTime(){}},connect(){},start(){},stop(){}};}
  }
  globalThis.AudioContext=FakeContext;
  try {
    const sound=createAudio(),state={day:1,phase:'open',elapsed:0,events:[],staff:[]};
    sound.update(state);assert.equal(created,0);
    assert.equal(await sound.unlock(),true);assert.equal(created,1);
    state.events.push({id:'one',type:'served',amount:42});sound.update(state);
    assert.ok(tones>0);const count=tones;sound.update(state);assert.equal(tones,count);
    sound.setMuted(true);assert.equal(sound.muted,true);
    state.events.push({id:'two',type:'cameo-paid',amount:120});sound.update(state);assert.equal(tones,count);
    sound.setMuted(false);sound.update(state);assert.equal(tones,count,'muted events never replay');
    const restored={...state,events:[{id:'old',type:'served',amount:10}]};sound.update(restored);assert.equal(tones,count,'loading a save does not replay old events');
  } finally {globalThis.AudioContext=original;}
});

test('blocked or unavailable audio is harmless',async()=>{
  const original=globalThis.AudioContext;
  try {
    globalThis.AudioContext=class{constructor(){throw new Error('blocked');}};
    const sound=createAudio();assert.equal(await sound.unlock(),false);assert.doesNotThrow(()=>sound.update({events:[]}));
    globalThis.AudioContext=undefined;assert.equal(await createAudio().unlock(),false);
  } finally {globalThis.AudioContext=original;}
});
