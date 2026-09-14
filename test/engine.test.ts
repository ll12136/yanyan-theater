// 逻辑验证脚本：不依赖 Phaser/浏览器，验证结局判定与剧情状态机。
// 运行：npx tsx test/engine.test.ts
import { pickEnding } from '../src/story/storyData';
import { StoryEngine } from '../src/story/storyEngine';

let failures = 0;
function assertEq(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${JSON.stringify(actual)}${ok ? '' : ` (expected ${JSON.stringify(expected)})`}`);
}

// 1. 结局判定：4 种组合
assertEq('放松高+接纳高 -> 今夜松开了', pickEnding({ courage: 5, acceptance: 3, empathy: 0 }).title, '今夜松开了');
assertEq('接纳极高 -> 允许自己躺着', pickEnding({ courage: 0, acceptance: 6, empathy: 0 }).title, '允许自己躺着');
assertEq('陪伴极高 -> 有人陪着', pickEnding({ courage: 0, acceptance: 0, empathy: 6 }).title, '有人陪着');
assertEq('都不够 -> 还在调整', pickEnding({ courage: 2, acceptance: 2, empathy: 2 }).title, '还在调整');

// 2. 完整流程：选今晚的心事 -> 记录动作 -> 选择 -> 结局
{
  const e = new StoryEngine();
  e.selectTrouble('cantfall');
  assertEq('选择心事 cantfall', e.trouble?.categoryLabel, '入睡困难');
  assertEq('样本关联', e.sample?.personName, '小满');
  assertEq('故事标题', e.story?.title, '凌晨两点的清醒');

  // 第一幕：拥抱（hug）后选 A（先缓解压力那一条）
  assertEq('场景1 文本存在', e.scene?.id, 'scene-1');
  e.record('hug'); // acceptance+2, empathy+2
  e.applyChoice(e.scene!.optionA.effect); // acceptance+2
  e.advanceScene();

  // 第二幕：挥剑（slash）后选 A
  assertEq('场景2 文本存在', e.scene?.id, 'scene-2');
  e.record('slash'); // courage+2
  e.applyChoice(e.scene!.optionA.effect); // empathy+2, acceptance+1
  e.advanceScene();

  // 第三幕：点头（nod）后选 B（让身体动一动那一条）
  assertEq('场景3 文本存在', e.scene?.id, 'scene-3');
  e.record('nod'); // acceptance+1, empathy+1
  e.applyChoice(e.scene!.optionB.effect); // courage+2
  e.advanceScene();

  // 追加的两幕：先看清一点，再抱住今晚的自己。
  while (!e.isStoryFinished) {
    e.record(e.scene?.action ?? 'hug');
    e.applyChoice(e.scene?.optionA.effect ?? {});
    e.advanceScene();
  }

  assertEq('故事走完', e.isStoryFinished, true);
  const ending = e.resolveEnding();
  // courage=4, acceptance=12, empathy=11 -> acceptance>=6 -> 允许自己躺着
  assertEq('入睡困难这一局的结局', ending.title, '允许自己躺着');
}

// 3. 挥剑动作记录验证（放松正确累积）
{
  const e = new StoryEngine();
  e.selectTrouble('replay');
  e.record('slash');
  e.record('slash');
  e.record('slash');
  assertEq('挥剑3次 放松 +6', e.state.courage, 6);
  // 加上一次拥抱，放松高 + 接纳也达标 -> 今夜松开了
  e.record('hug');
  e.applyChoice({ acceptance: 2 });
  assertEq('挥剑主导+接纳 -> 今夜松开了', e.resolveEnding().title, '今夜松开了');
}

// 4. 六个睡眠主题都要有本地剧情与结局走向，降级时不能空手
{
  const e = new StoryEngine();
  for (const id of ['cantfall', 'phone', 'pressure', 'sitting', 'replay', 'pileup']) {
    e.selectTrouble(id);
    assertEq(`${id} 有心事卡`, Boolean(e.trouble), true);
    assertEq(`${id} 有本地剧情`, Boolean(e.story && e.story.scenes.length >= 3), true);
    assertEq(`${id} 首幕可读`, Boolean(e.scene?.text), true);
    assertEq(`${id} 两条路不同`, e.scene!.optionA.label !== e.scene!.optionB.label, true);
  }
}

console.log(failures === 0 ? '\n全部通过 ✅' : `\n${failures} 个失败 ❌`);
process.exit(failures === 0 ? 0 : 1);
