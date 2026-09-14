// 动作 → 槽位不变量验收。
//
// 设计约定：「左边那个选项」永远是同一个槽位（A 槽 = 收 / 先照顾自己），
// 幕与幕之间可以换动作词汇，但**动作与槽位的对应关系一次都不能变**，
// 否则玩家就得在每一幕重新学一遍，并且在最怕选错的时刻选错。
//
// 这个测试通过 Vite 真加载 TS 模块来查，不是 grep 源文件里的字符串——
// grep 只能证明「文件里有这行字」，证明不了「剧情配置没有违反它」。
const {chromium}=require('D:/Zhi_Hei/covel/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const assert=require('node:assert/strict');

(async()=>{const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});try{
const p=await b.newPage({viewport:{width:900,height:600}});
await p.goto('http://localhost:5174');
await p.waitForTimeout(600);

const data=await p.evaluate(async()=>{
  const slot=await import('/src/input/actionSlot.ts');
  const mapper=await import('/src/input/actionMapper.ts');
  return {
    table:slot.ACTION_SLOT,
    role:slot.SLOT_ROLE,
    rotation:slot.ACT_ACTION_ROTATION.map(a=>({slotA:a.slotA,slotB:a.slotB})),
    actions:Object.keys(mapper.ACTION_MAP),
    gestures:mapper.ACTION_GESTURES
  };
});

// 1. 表本身自洽
assert.deepEqual(data.role,{A:'hold',B:'move'},'槽位语义应固定为 A=收 / B=放');
for(const [action,slot] of Object.entries(data.table)){
  assert.ok(slot==='A'||slot==='B',`${action} 的槽位只能是 A 或 B，实际是 ${slot}`);
  assert.ok(data.actions.includes(action),`${action} 在槽位表里，但键位表 ACTION_MAP 里没有它`);
}
assert.ok(Object.values(data.table).includes('A')&&Object.values(data.table).includes('B'),'A、B 两个槽位都要有动作');
console.log(`  ✓ 槽位表自洽：${Object.entries(data.table).map(([a,s])=>`${a}→${s}`).join(' ')}`);

// 2. 按幕轮换表：换动作词汇，不换槽位语义
assert.ok(data.rotation.length>=2,'轮换表至少要有两幕，否则「幕间换动作」不成立');
const usedAs=new Map();
const violations=[];
data.rotation.forEach((act,index)=>{
  const {slotA,slotB}=act;
  if(slotA===slotB) violations.push(`第${index+1}幕：slotA 与 slotB 是同一个动作 ${slotA}`);
  if(data.table[slotA]!=='A') violations.push(`第${index+1}幕：slotA=${slotA}，但全局表里它是 ${data.table[slotA]} 槽`);
  if(data.table[slotB]!=='B') violations.push(`第${index+1}幕：slotB=${slotB}，但全局表里它是 ${data.table[slotB]} 槽`);
  for(const [action,slot] of [[slotA,'A'],[slotB,'B']]){
    const before=usedAs.get(action);
    if(before&&before!==slot) violations.push(`动作 ${action} 在第${index+1}幕被当成 ${slot} 槽，之前已是 ${before} 槽`);
    usedAs.set(action,slot);
  }
  // 手势要能显示给玩家看，否则选项卡片上没东西可写
  for(const action of [slotA,slotB]){
    if(!data.gestures[action]) violations.push(`第${index+1}幕的动作 ${action} 没有手势名，选项卡片没法告诉玩家怎么做`);
  }
});
assert.deepEqual(violations,[],`按幕轮换表违反了「动作→槽位永不变」：\n  ${violations.join('\n  ')}`);
// 幕与幕之间必须真的换动作，否则「每一幕两个动作」等于没做
const changed=data.rotation.filter((act,i)=>i>0&&(act.slotA!==data.rotation[i-1].slotA||act.slotB!==data.rotation[i-1].slotB)).length;
assert.ok(changed>=1,`相邻两幕的动作应当换掉，实际只有 ${changed} 次变化`);
console.log(`  ✓ ${data.rotation.length} 幕轮换合法：${data.rotation.map((a,i)=>`第${i+1}幕 ${a.slotA}/${a.slotB}`).join('，')}`);

console.log('PASS 动作→槽位不变量成立（槽位表自洽 + 按幕轮换未违反 + 手势名齐全）');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1});
