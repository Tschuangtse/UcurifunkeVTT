import { test } from "node:test";
import assert from "node:assert/strict";
import { damageRows, isWound, readDamage, regenerate, regenerationAmounts, regenerationTraits } from "../src/energy.js";

test("regeneration follows rest, illness, iron, ordination and refund rules", () => {
  const data = { energies:[{key:"LE",max:30,value:17},{key:"AE",max:20,value:10},{key:"KE",max:30,value:28}] };
  const options = { restHours:6,camp:2,bed:3,interrupted:true,fastHealing:true,sleepDisorder:true,
    meditated:true,astralRegenerationLevel:3,useLeyLines:true,leyLineStrength:2,ironExposure:true,
    ordinationRank:4,preventKE:true,karmaRefund:5 };
  assert.deepEqual(regenerationAmounts(data, options).amounts,{ LE:6,AE:5,KE:5 });
  assert.deepEqual(regenerationAmounts(data, options).gains,{ LE:6,AE:5,KE:2 });
  assert.deepEqual(regenerationAmounts(data, {...options,sick:true}).amounts,{ LE:0,AE:0,KE:5 });
  assert.equal(regenerationAmounts(data, {...options,severeIronBan:true}).amounts.AE,0);
  assert.equal(regenerationAmounts({...data,regeneration:{required:6,nonSleeper:1}}, {...options,sleepDebt:true}).amounts.LE,0);
  assert.equal(regenerationTraits({Advantages:[{Name:"Nicht-Schläfer II"}]}).required,0);
});

test("damage preserves originals and heals blood magic before older wounds", () => {
  const damage=readDamage({LeLossInjury:8,LeLossBloodmagic:4});
  const data={energies:[{key:"LE",max:30,value:18}],damage};
  assert.equal(isWound(damage[0],7),true);
  const healed=regenerate(data,{restHours:6,camp:3,bed:3});
  assert.equal(healed.energies[0].value,24);
  assert.deepEqual(healed.damage,[{source:"Verletzungen",original:8,remaining:6,timestamp:""}]);
  assert.equal(isWound({...healed.damage[0],remaining:4},7),false);
  assert.equal(damageRows({energies:[{key:"LE",max:20,value:-1}]}).at(0).remaining,21);
  assert.equal(regenerate({ ...data, energies:[{key:"LE",max:30,value:27}] },
    {restHours:6,camp:3,bed:3}).energies[0].value,24);
});
