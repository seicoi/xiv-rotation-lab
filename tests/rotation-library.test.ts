import assert from "node:assert/strict";
import test from "node:test";
import {ROTATION_LIBRARY_LIMIT,upsertRotationLibraryEntry} from "../app/rotation-library";

test("rotation library stops at thirty entries",()=>{
  const entries=Array.from({length:ROTATION_LIBRARY_LIMIT},(_,index)=>({id:String(index),title:`Rotation ${index}`}));
  const result=upsertRotationLibraryEntry(entries,{id:"overflow",title:"Overflow"},item=>item.id);
  assert.equal(result.length,ROTATION_LIBRARY_LIMIT);
  assert.equal(result.some(item=>item.id==="overflow"),false);
});

test("a linked working sheet updates its saved rotation at the limit",()=>{
  const entries=Array.from({length:ROTATION_LIBRARY_LIMIT},(_,index)=>({id:String(index),title:`Rotation ${index}`}));
  const result=upsertRotationLibraryEntry(entries,{id:"12",title:"Updated"},item=>item.id);
  assert.equal(result.length,ROTATION_LIBRARY_LIMIT);
  assert.equal(result.find(item=>item.id==="12")?.title,"Updated");
});
