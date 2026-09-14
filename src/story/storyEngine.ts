import { GameAction } from '../input/actionMapper';
import { createInitialState, StoryState } from './storyState';
import {
  TROUBLES,
  SAMPLES,
  LOCAL_STORIES,
  Trouble,
  Sample,
  LocalStory,
  StorySceneNode,
  Ending,
  pickEnding,
  ACTION_EFFECTS,
  EffectValue
} from './storyData';

/** StoryEngine：维护助眠指标、记录动作、推进故事、结算结局 */
export class StoryEngine {
  state: StoryState;

  constructor() {
    this.state = createInitialState();
  }

  get trouble(): Trouble | null {
    return this.state.currentTroubleId ? TROUBLES[this.state.currentTroubleId] : null;
  }

  get sample(): Sample | null {
    return this.state.currentSampleId ? SAMPLES[this.state.currentSampleId] : null;
  }

  get story(): LocalStory | null {
    return this.trouble ? LOCAL_STORIES[this.trouble.storyId] : null;
  }

  get scene(): StorySceneNode | null {
    const story = this.story;
    if (!story) return null;
    return story.scenes[this.state.currentSceneIndex] ?? null;
  }

  get isStoryFinished(): boolean {
    const story = this.story;
    if (!story) return false;
    return this.state.currentSceneIndex >= story.scenes.length;
  }

  /** 选择今晚的心事 */
  selectTrouble(troubleId: string): void {
    this.state.currentTroubleId = troubleId;
    this.state.currentSampleId = TROUBLES[troubleId]?.sampleId ?? null;
    this.state.currentSceneIndex = 0;
  }

  /** 记录一个动作并应用它的助眠效果 */
  record(action: GameAction): EffectValue {
    this.state.actions.push(action);
    const effect = ACTION_EFFECTS[action] ?? {};
    this.applyEffect(effect);
    return effect;
  }

  /** 应用一个选项的数值效果 */
  applyChoice(effect: EffectValue): void {
    this.applyEffect(effect);
  }

  /** 推进到下一个场景，返回是否还有场景 */
  advanceScene(): boolean {
    this.state.currentSceneIndex += 1;
    return !this.isStoryFinished;
  }

  /** 结算结局 */
  resolveEnding(): Ending {
    return pickEnding(this.state);
  }

  /** 收藏样本 */
  saveSample(sampleId: string): void {
    if (!this.state.savedSamples.includes(sampleId)) {
      this.state.savedSamples.push(sampleId);
    }
  }

  /**
   * 拥抱一个知乎真实声音：记动作、加治愈指标，并记下拥抱过谁。
   * 同一条内容只计一次，重复拥抱返回 false。
   */
  hug(voiceId: string): boolean {
    if (!voiceId || this.state.huggedVoices.includes(voiceId)) return false;
    this.state.huggedVoices.push(voiceId);
    this.record('hug');
    return true;
  }

  get huggedVoiceCount(): number {
    return this.state.huggedVoices.length;
  }

  get savedSampleList(): Sample[] {
    return this.state.savedSamples.map((id) => SAMPLES[id]).filter(Boolean);
  }

  reset(): void {
    const savedSamples = this.state.savedSamples;
    this.state = createInitialState();
    this.state.savedSamples = savedSamples;
  }

  private applyEffect(effect: EffectValue): void {
    this.state.courage += effect.courage ?? 0;
    this.state.acceptance += effect.acceptance ?? 0;
    this.state.empathy += effect.empathy ?? 0;
    this.state.curiosity += effect.curiosity ?? 0;
  }
}
