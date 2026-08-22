import test from "node:test";
import assert from "node:assert/strict";
import {isRoleAction,moveRecastItem,sortRecastItems} from "../app/recast-preferences";

test("role actions are always placed after job actions",()=>{
  const items=[{id:7531},{id:100},{id:7561},{id:200}];
  assert.deepEqual(sortRecastItems(items,[]).map(item=>item.id),[100,200,7531,7561]);
  assert.equal(isRoleAction(7531),true);
  assert.equal(isRoleAction(100),false);
});

test("recast items can be reordered only inside their group",()=>{
  const items=[{id:100},{id:200},{id:7531},{id:7561}];
  assert.deepEqual(moveRecastItem(items,[],"200","100"),["200","100","7531","7561"]);
  assert.deepEqual(moveRecastItem(items,[],"7531","100"),["100","200","7531","7561"]);
});
