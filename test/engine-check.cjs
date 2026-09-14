"use strict";

// src/story/storyData.ts
var ACTION_EFFECTS = {
  slash: { courage: 2 },
  hug: { acceptance: 2, empathy: 2 },
  nod: { acceptance: 1, empathy: 1 },
  dodge: { courage: -1 },
  investigate: { curiosity: 1, empathy: 2 }
};
var TROUBLES = {
  career: {
    id: "career",
    category: "career",
    categoryLabel: "\u804C\u4E1A\u8FF7\u832B",
    text: "\u4E0D\u60F3\u7EE7\u7EED\u73B0\u5728\u7684\u5DE5\u4F5C\u4E86\uFF0C\u4F46\u53C8\u4E0D\u77E5\u9053\u81EA\u5DF1\u80FD\u53BB\u54EA\u513F",
    similarCount: 2431,
    keywords: ["\u8F9E\u804C", "\u8F6C\u884C", "\u804C\u4E1A\u8FF7\u832B"],
    sampleId: "sample-career",
    storyId: "story-career"
  },
  study: {
    id: "study",
    category: "study",
    categoryLabel: "\u5B66\u4E1A\u538B\u529B",
    text: "\u8003\u7814\u8FD8\u662F\u5DE5\u4F5C\uFF0C\u600E\u4E48\u9009\u90FD\u5F88\u7126\u8651",
    similarCount: 1876,
    keywords: ["\u8003\u7814", "\u9009\u62E9", "\u7126\u8651"],
    sampleId: "sample-study",
    storyId: "story-study"
  },
  love: {
    id: "love",
    category: "love",
    categoryLabel: "\u4EB2\u5BC6\u5173\u7CFB",
    text: "\u559C\u6B22\u4E00\u4E2A\u4EBA\uFF0C\u4F46\u8FDF\u8FDF\u4E0D\u6562\u8868\u767D",
    similarCount: 3204,
    keywords: ["\u6697\u604B", "\u8868\u767D", "\u52C7\u6C14"],
    sampleId: "sample-love",
    storyId: "story-love"
  },
  friendship: {
    id: "friendship",
    category: "friendship",
    categoryLabel: "\u4E0E\u670B\u53CB\u758F\u8FDC",
    text: "\u548C\u670B\u53CB\u6E10\u884C\u6E10\u8FDC\uFF0C\u8981\u4E0D\u8981\u4E3B\u52A8\u633D\u56DE",
    similarCount: 1589,
    keywords: ["\u670B\u53CB", "\u758F\u8FDC", "\u633D\u56DE"],
    sampleId: "sample-friendship",
    storyId: "story-friendship"
  },
  selfdoubt: {
    id: "selfdoubt",
    category: "selfdoubt",
    categoryLabel: "\u81EA\u6211\u6000\u7591",
    text: "\u603B\u89C9\u5F97\u81EA\u5DF1\u843D\u540E\u4E8E\u540C\u9F84\u4EBA\uFF0C\u8D8A\u6765\u8D8A\u7126\u8651",
    similarCount: 2948,
    keywords: ["\u540C\u9F84\u4EBA", "\u843D\u540E", "\u7126\u8651"],
    sampleId: "sample-selfdoubt",
    storyId: "story-selfdoubt"
  },
  restart: {
    id: "restart",
    category: "restart",
    categoryLabel: "\u60F3\u91CD\u65B0\u5F00\u59CB",
    text: "\u60F3\u79BB\u5F00\u719F\u6089\u7684\u57CE\u5E02\uFF0C\u53BB\u4E00\u4E2A\u6CA1\u4EBA\u8BA4\u8BC6\u7684\u5730\u65B9\u91CD\u65B0\u5F00\u59CB",
    similarCount: 1342,
    keywords: ["\u79BB\u5F00", "\u91CD\u65B0\u5F00\u59CB", "\u964C\u751F\u57CE\u5E02"],
    sampleId: "sample-restart",
    storyId: "story-restart"
  }
};
var TROUBLE_LIST = Object.values(TROUBLES);
var SAMPLES = {
  "sample-career": {
    id: "sample-career",
    title: "\u6211\u4ECE\u4E92\u8054\u7F51\u79BB\u804C\u540E\u505A\u4E86\u4EC0\u4E48",
    personName: "\u6797\u821F",
    age: "29 \u5C81",
    content: "\u6211\u4E5F\u66FE\u7ECF\u4EE5\u4E3A\uFF0C\u79BB\u5F00\u73B0\u5728\u7684\u5DE5\u4F5C\u5C31\u7B49\u4E8E\u5931\u8D25\u3002\u540E\u6765\u6211\u4F11\u606F\u4E86\u4E09\u4E2A\u6708\uFF0C\u53BB\u505A\u4E86\u4E00\u6BB5\u5B8C\u5168\u4E0D\u540C\u7684\u5DE5\u4F5C\u3002\u6211\u6CA1\u6709\u7ACB\u523B\u53D8\u5F97\u66F4\u597D\uFF0C\u4F46\u7EC8\u4E8E\u91CD\u65B0\u611F\u89C9\u5230\uFF0C\u751F\u6D3B\u662F\u81EA\u5DF1\u7684\u3002",
    sourceTitle: "\u6211\u4ECE\u4E92\u8054\u7F51\u79BB\u804C\u540E\u505A\u4E86\u4EC0\u4E48",
    author: "\u533F\u540D",
    voteCount: 12600,
    sourceUrl: "https://www.zhihu.com/"
  },
  "sample-study": {
    id: "sample-study",
    title: "\u8003\u7814\u5931\u8D25\u540E\uFF0C\u6211\u627E\u5230\u4E86\u53E6\u4E00\u6761\u8DEF",
    personName: "\u82CF\u53F6",
    age: "23 \u5C81",
    content: "\u8003\u7814\u5931\u8D25\u90A3\u5929\uFF0C\u6211\u54ED\u4E86\u4E00\u6574\u665A\uFF0C\u89C9\u5F97\u81EA\u5DF1\u7684\u4EBA\u751F\u5B8C\u4E86\u3002\u4F46\u7B2C\u4E8C\u5E74\uFF0C\u6211\u4E00\u8FB9\u5DE5\u4F5C\u4E00\u8FB9\u60F3\u6E05\u695A\u4E86\u81EA\u5DF1\u8981\u4EC0\u4E48\u3002\u539F\u6765\u6709\u4E9B\u8DEF\uFF0C\u4E0D\u662F\u975E\u8981\u4E00\u6B21\u8D70\u901A\u3002",
    sourceTitle: "\u8003\u7814\u5931\u8D25\u540E\uFF0C\u6211\u627E\u5230\u4E86\u53E6\u4E00\u6761\u8DEF",
    author: "\u533F\u540D",
    voteCount: 9800,
    sourceUrl: "https://www.zhihu.com/"
  },
  "sample-love": {
    id: "sample-love",
    title: "\u6211\u9F13\u8D77\u52C7\u6C14\u8868\u767D\u4E4B\u540E",
    personName: "\u9648\u9ED8",
    age: "25 \u5C81",
    content: "\u6211\u6697\u604B\u4E86\u4E24\u5E74\uFF0C\u6700\u540E\u5728\u4E00\u4E2A\u5F88\u666E\u901A\u7684\u4E0B\u5348\u8BF4\u4E86\u51FA\u6765\u3002\u7ED3\u679C\u6CA1\u6709\u6211\u60F3\u8C61\u7684\u90A3\u4E48\u53EF\u6015\u2014\u2014\u6211\u4EEC\u6CA1\u5728\u4E00\u8D77\uFF0C\u4F46\u6211\u7EC8\u4E8E\u653E\u4E0B\u4E86\u3002\u6709\u4E9B\u9057\u61BE\uFF0C\u8BF4\u51FA\u6765\u5C31\u4E0D\u518D\u662F\u9057\u61BE\u4E86\u3002",
    sourceTitle: "\u6211\u9F13\u8D77\u52C7\u6C14\u8868\u767D\u4E4B\u540E",
    author: "\u533F\u540D",
    voteCount: 15300,
    sourceUrl: "https://www.zhihu.com/"
  },
  "sample-friendship": {
    id: "sample-friendship",
    title: "\u6211\u4E3B\u52A8\u7ED9\u4E09\u5E74\u6CA1\u8054\u7CFB\u7684\u670B\u53CB\u53D1\u4E86\u6D88\u606F",
    personName: "\u4F55\u96E8",
    age: "27 \u5C81",
    content: '\u6211\u4EEC\u56E0\u4E3A\u4E00\u70B9\u5C0F\u4E8B\u51B7\u6218\u4E86\u4E09\u5E74\u3002\u53BB\u5E74\u6211\u9F13\u8D77\u52C7\u6C14\u53D1\u4E86\u53E5"\u6700\u8FD1\u600E\u4E48\u6837"\uFF0C\u5979\u79D2\u56DE\u4E86\u3002\u539F\u6765\u6211\u4EEC\u90FD\u5728\u7B49\u5BF9\u65B9\u5148\u5F00\u53E3\u3002\u6709\u4E9B\u670B\u53CB\uFF0C\u503C\u5F97\u4F60\u4E3B\u52A8\u4E00\u6B21\u3002',
    sourceTitle: "\u6211\u4E3B\u52A8\u7ED9\u4E09\u5E74\u6CA1\u8054\u7CFB\u7684\u670B\u53CB\u53D1\u4E86\u6D88\u606F",
    author: "\u533F\u540D",
    voteCount: 11200,
    sourceUrl: "https://www.zhihu.com/"
  },
  "sample-selfdoubt": {
    id: "sample-selfdoubt",
    title: "\u603B\u89C9\u5F97\u81EA\u5DF1\u843D\u540E\u540C\u9F84\u4EBA\uFF0C\u540E\u6765\u6211\u660E\u767D\u4E86",
    personName: "\u5468\u822A",
    age: "30 \u5C81",
    content: '\u6211\u4E00\u76F4\u89C9\u5F97\u81EA\u5DF1\u662F\u540C\u9F84\u4EBA\u91CC\u6DF7\u5F97\u6700\u5DEE\u7684\u3002\u76F4\u5230\u6709\u6B21\u805A\u4F1A\uFF0C\u6211\u624D\u53D1\u73B0\u5927\u5BB6\u90FD\u5728\u7126\u8651\u3002\u6CA1\u6709\u4EBA\u771F\u7684"\u9886\u5148"\uFF0C\u6BCF\u4E2A\u4EBA\u90FD\u5728\u81EA\u5DF1\u7684\u65F6\u533A\u91CC\uFF0C\u6162\u6162\u8D70\u3002',
    sourceTitle: "\u603B\u89C9\u5F97\u81EA\u5DF1\u843D\u540E\u540C\u9F84\u4EBA\uFF0C\u540E\u6765\u6211\u660E\u767D\u4E86",
    author: "\u533F\u540D",
    voteCount: 20100,
    sourceUrl: "https://www.zhihu.com/"
  },
  "sample-restart": {
    id: "sample-restart",
    title: "\u6211\u8F9E\u6389\u5DE5\u4F5C\uFF0C\u642C\u53BB\u4E86\u4E00\u4E2A\u964C\u751F\u57CE\u5E02",
    personName: "\u6C88\u661F",
    age: "26 \u5C81",
    content: "\u6211\u63E3\u7740\u51E0\u5343\u5757\u53BB\u4E86\u4E00\u4E2A\u6CA1\u4EBA\u8BA4\u8BC6\u6211\u7684\u57CE\u5E02\u3002\u5934\u4E09\u4E2A\u6708\u5F88\u96BE\uFF0C\u4F46\u540E\u6765\u6211\u5728\u8FD9\u91CC\u9047\u5230\u4E86\u65B0\u7684\u4EBA\u3001\u65B0\u7684\u751F\u6D3B\u3002\u79BB\u5F00\u4E0D\u662F\u9003\u907F\uFF0C\u662F\u7ED9\u81EA\u5DF1\u4E00\u4E2A\u91CD\u65B0\u9009\u62E9\u7684\u673A\u4F1A\u3002",
    sourceTitle: "\u6211\u8F9E\u6389\u5DE5\u4F5C\uFF0C\u642C\u53BB\u4E86\u4E00\u4E2A\u964C\u751F\u57CE\u5E02",
    author: "\u533F\u540D",
    voteCount: 8600,
    sourceUrl: "https://www.zhihu.com/"
  }
};
var LOCAL_STORIES = {
  "story-career": {
    id: "story-career",
    title: "\u98CE\u4ECE\u8F9E\u804C\u90A3\u5929\u5439\u6765",
    opening: "\u90A3\u5929\uFF0C\u6797\u821F\u7EC8\u4E8E\u5173\u6389\u4E86\u7535\u8111\u3002\u4ED6\u7AD9\u5728\u516C\u4EA4\u7AD9\u53F0\uFF0C\u7B2C\u4E00\u6B21\u4E0D\u77E5\u9053\u4E0B\u4E00\u7AD9\u8981\u53BB\u54EA\u91CC\u3002",
    scenes: [
      {
        id: "scene-1",
        text: "\u6797\u821F\u6525\u7740\u79BB\u804C\u8BC1\u660E\uFF0C\u7AD9\u5728\u7AD9\u53F0\u8FB9\u3002\u98CE\u5F88\u5927\uFF0C\u4ED6\u6709\u70B9\u60F3\u54ED\uFF0C\u53C8\u6709\u70B9\u5982\u91CA\u91CD\u8D1F\u3002",
        prompt: "\u4F60\u4F1A\u600E\u4E48\u505A\uFF1F",
        action: "nod",
        optionA: { label: "\u5148\u505C\u4E0B\u6765\u4F11\u606F", effect: { acceptance: 2 } },
        optionB: { label: "\u7EE7\u7EED\u5BFB\u627E\u65B9\u5411", effect: { courage: 2 } }
      },
      {
        id: "scene-2",
        text: "\u4E09\u4E2A\u6708\u540E\uFF0C\u6797\u821F\u5F00\u59CB\u5C1D\u8BD5\u4E00\u4EFD\u5B8C\u5168\u4E0D\u540C\u7684\u5DE5\u4F5C\u3002\u4E00\u5207\u4ECE\u5934\u5B66\u8D77\uFF0C\u7B28\u62D9\u4F46\u8E0F\u5B9E\u3002",
        prompt: "\u6B64\u523B\uFF0C\u7ED9\u6797\u821F\u4E00\u70B9\u652F\u6301\u3002",
        action: "hug",
        optionA: { label: "\u9F13\u52B1\u4ED6", effect: { courage: 2 } },
        optionB: { label: "\u7406\u89E3\u4ED6\u7684\u4E0D\u5B89", effect: { empathy: 2 } }
      },
      {
        id: "scene-3",
        text: "\u6797\u821F\u6CA1\u6709\u7ACB\u523B\u53D8\u5F97\u66F4\u597D\u3002\u4F46\u4ED6\u7EC8\u4E8E\u91CD\u65B0\u611F\u89C9\u5230\uFF0C\u751F\u6D3B\u662F\u81EA\u5DF1\u7684\u3002",
        prompt: "\u9762\u5BF9\u672A\u77E5\uFF0C\u4F60\u4F1A\u2026\u2026",
        action: "slash",
        optionA: { label: "\u4E3B\u52A8\u9762\u5BF9", effect: { courage: 2 } },
        optionB: { label: "\u6162\u6162\u63A5\u7EB3", effect: { acceptance: 2 } }
      }
    ]
  },
  "story-study": {
    id: "story-study",
    title: "\u53E6\u4E00\u6761\u8DEF",
    opening: "\u8003\u7814\u6210\u7EE9\u51FA\u6765\u7684\u90A3\u5929\uFF0C\u82CF\u53F6\u76EF\u7740\u5C4F\u5E55\uFF0C\u773C\u6CEA\u6B62\u4E0D\u4F4F\u5730\u5F80\u4E0B\u6389\u3002",
    scenes: [
      {
        id: "scene-1",
        text: "\u82CF\u53F6\u89C9\u5F97\u81EA\u5DF1\u7684\u4EBA\u751F\u5B8C\u4E86\u3002\u5979\u8EB2\u5728\u88AB\u5B50\u91CC\uFF0C\u4E0D\u60F3\u89C1\u4EFB\u4F55\u4EBA\u3002",
        prompt: "\u4F60\u4F1A\u600E\u4E48\u505A\uFF1F",
        action: "hug",
        optionA: { label: "\u966A\u5979\u54ED\u4E00\u573A", effect: { empathy: 2 } },
        optionB: { label: "\u529D\u5979\u632F\u4F5C", effect: { courage: 2 } }
      },
      {
        id: "scene-2",
        text: "\u7B2C\u4E8C\u5E74\uFF0C\u82CF\u53F6\u4E00\u8FB9\u5DE5\u4F5C\uFF0C\u4E00\u8FB9\u6162\u6162\u60F3\u6E05\u695A\u4E86\u81EA\u5DF1\u771F\u6B63\u60F3\u8981\u4EC0\u4E48\u3002",
        prompt: "\u7406\u89E3\u5979\u7684\u9009\u62E9\u3002",
        action: "nod",
        optionA: { label: "\u8BA4\u53EF\u5979\u7684\u8282\u594F", effect: { acceptance: 2 } },
        optionB: { label: "\u9F13\u52B1\u5979\u7EE7\u7EED", effect: { courage: 2 } }
      },
      {
        id: "scene-3",
        text: "\u539F\u6765\u6709\u4E9B\u8DEF\uFF0C\u4E0D\u662F\u975E\u8981\u4E00\u6B21\u8D70\u901A\u3002\u7ED5\u4E00\u70B9\uFF0C\u4E5F\u80FD\u5230\u3002",
        prompt: "\u9762\u5BF9\u7ED5\u8DEF\uFF0C\u4F60\u4F1A\u2026\u2026",
        action: "slash",
        optionA: { label: "\u63A5\u7EB3\u81EA\u5DF1\u7684\u8282\u594F", effect: { acceptance: 2 } },
        optionB: { label: "\u7EE7\u7EED\u5411\u524D\u8D70", effect: { courage: 2 } }
      }
    ]
  },
  "story-love": {
    id: "story-love",
    title: "\u8BF4\u51FA\u53E3\u7684\u9057\u61BE",
    opening: "\u9648\u9ED8\u6697\u604B\u4E86\u90A3\u4E2A\u4EBA\u4E24\u5E74\u3002\u90A3\u5929\u4E0B\u5348\uFF0C\u4ED6\u51B3\u5B9A\u8BF4\u51FA\u6765\u3002",
    scenes: [
      {
        id: "scene-1",
        text: "\u9648\u9ED8\u7684\u624B\u6307\u60AC\u5728\u53D1\u9001\u952E\u4E0A\uFF0C\u5FC3\u810F\u5FEB\u5F97\u4E0D\u50CF\u8BDD\u3002",
        prompt: "\u4F60\u4F1A\u600E\u4E48\u505A\uFF1F",
        action: "nod",
        optionA: { label: "\u7ED9\u4ED6\u52C7\u6C14", effect: { courage: 2 } },
        optionB: { label: "\u7406\u89E3\u4ED6\u7684\u5BB3\u6015", effect: { empathy: 2 } }
      },
      {
        id: "scene-2",
        text: "\u6D88\u606F\u53D1\u51FA\u53BB\u4E86\u3002\u7ED3\u679C\u6CA1\u6709\u60F3\u8C61\u4E2D\u90A3\u4E48\u53EF\u6015\u2014\u2014\u4ED6\u4EEC\u6CA1\u5728\u4E00\u8D77\u3002",
        prompt: "\u6B64\u523B\uFF0C\u966A\u966A\u4ED6\u3002",
        action: "hug",
        optionA: { label: "\u7ED9\u4ED6\u4E00\u4E2A\u62E5\u62B1", effect: { empathy: 2, acceptance: 2 } },
        optionB: { label: '\u8BF4"\u4F60\u505A\u5F97\u5F88\u597D"', effect: { courage: 2 } }
      },
      {
        id: "scene-3",
        text: "\u9648\u9ED8\u7EC8\u4E8E\u653E\u4E0B\u4E86\u3002\u6709\u4E9B\u9057\u61BE\uFF0C\u8BF4\u51FA\u6765\u5C31\u4E0D\u518D\u662F\u9057\u61BE\u4E86\u3002",
        prompt: "\u9762\u5BF9\u9057\u61BE\uFF0C\u4F60\u4F1A\u2026\u2026",
        action: "slash",
        optionA: { label: "\u63A5\u7EB3\u8FD9\u4EFD\u9057\u61BE", effect: { acceptance: 2 } },
        optionB: { label: "\u5411\u524D\u770B", effect: { courage: 2 } }
      }
    ]
  },
  "story-friendship": {
    id: "story-friendship",
    title: "\u5148\u5F00\u53E3\u7684\u4EBA",
    opening: '\u4F55\u96E8\u548C\u90A3\u4E2A\u670B\u53CB\u51B7\u6218\u4E86\u4E09\u5E74\u3002\u53BB\u5E74\uFF0C\u5979\u7EC8\u4E8E\u9F13\u8D77\u52C7\u6C14\u53D1\u4E86\u53E5"\u6700\u8FD1\u600E\u4E48\u6837"\u3002',
    scenes: [
      {
        id: "scene-1",
        text: "\u5BF9\u8BDD\u6846\u6253\u5F00\u53C8\u5173\u6389\uFF0C\u4F55\u96E8\u76EF\u7740\u90A3\u53E5\u8FDF\u8FDF\u4E0D\u6562\u53D1\u9001\u7684\u8BDD\u3002",
        prompt: "\u4F60\u4F1A\u600E\u4E48\u505A\uFF1F",
        action: "nod",
        optionA: { label: "\u9F13\u52B1\u5979\u53D1\u9001", effect: { courage: 2 } },
        optionB: { label: "\u7406\u89E3\u5979\u7684\u72B9\u8C6B", effect: { empathy: 2 } }
      },
      {
        id: "scene-2",
        text: "\u6D88\u606F\u53D1\u51FA\u53BB\u4E86\u3002\u5BF9\u65B9\u79D2\u56DE\u4E86\u3002\u539F\u6765\u5979\u4EEC\u90FD\u5728\u7B49\u5BF9\u65B9\u5148\u5F00\u53E3\u3002",
        prompt: "\u4E3A\u8FD9\u4EFD\u91CD\u9022\u9AD8\u5174\u3002",
        action: "hug",
        optionA: { label: "\u62E5\u62B1\u8FD9\u4EFD\u91CD\u9022", effect: { empathy: 2, acceptance: 2 } },
        optionB: { label: "\u5E86\u795D\u5979\u7684\u52C7\u6562", effect: { courage: 2 } }
      },
      {
        id: "scene-3",
        text: "\u6709\u4E9B\u670B\u53CB\uFF0C\u503C\u5F97\u4F60\u4E3B\u52A8\u4E00\u6B21\u3002\u4E3B\u52A8\u4E0D\u4E22\u4EBA\u3002",
        prompt: "\u9762\u5BF9\u4E3B\u52A8\uFF0C\u4F60\u4F1A\u2026\u2026",
        action: "slash",
        optionA: { label: "\u8BA4\u53EF\u4E3B\u52A8\u7684\u4EF7\u503C", effect: { acceptance: 2 } },
        optionB: { label: "\u66F4\u52C7\u6562\u4E00\u70B9", effect: { courage: 2 } }
      }
    ]
  },
  "story-selfdoubt": {
    id: "story-selfdoubt",
    title: "\u6BCF\u4E2A\u4EBA\u90FD\u5728\u81EA\u5DF1\u7684\u65F6\u533A",
    opening: "\u5468\u822A\u4E00\u76F4\u89C9\u5F97\u81EA\u5DF1\u662F\u540C\u9F84\u4EBA\u91CC\u6DF7\u5F97\u6700\u5DEE\u7684\u3002\u76F4\u5230\u90A3\u6B21\u805A\u4F1A\u3002",
    scenes: [
      {
        id: "scene-1",
        text: "\u805A\u4F1A\u684C\u4E0A\uFF0C\u6BCF\u4E2A\u4EBA\u90FD\u5728\u8BF4\u81EA\u5DF1\u6709\u591A\u7126\u8651\u3002\u5468\u822A\u6123\u4F4F\u4E86\u3002",
        prompt: "\u4F60\u4F1A\u600E\u4E48\u505A\uFF1F",
        action: "nod",
        optionA: { label: "\u503E\u542C\u5927\u5BB6\u7684\u4E0D\u5B89", effect: { empathy: 2 } },
        optionB: { label: "\u8BF4\u51FA\u81EA\u5DF1\u7684\u7126\u8651", effect: { courage: 2 } }
      },
      {
        id: "scene-2",
        text: '\u539F\u6765\u6CA1\u6709\u4EBA\u771F\u7684"\u9886\u5148"\u3002\u6BCF\u4E2A\u4EBA\u90FD\u5728\u81EA\u5DF1\u7684\u65F6\u533A\u91CC\uFF0C\u6162\u6162\u8D70\u3002',
        prompt: "\u548C\u8FD9\u4EFD\u91CA\u7136\u5F85\u4E00\u4F1A\u513F\u3002",
        action: "hug",
        optionA: { label: "\u63A5\u7EB3\u81EA\u5DF1\u7684\u8282\u594F", effect: { acceptance: 2 } },
        optionB: { label: "\u7ED9\u81EA\u5DF1\u4E00\u70B9\u80AF\u5B9A", effect: { courage: 2 } }
      },
      {
        id: "scene-3",
        text: "\u5468\u822A\u4E0D\u518D\u548C\u522B\u4EBA\u6BD4\u4E86\u3002\u4ED6\u5F00\u59CB\u770B\u81EA\u5DF1\u811A\u4E0B\u7684\u8DEF\u3002",
        prompt: "\u9762\u5BF9\u6BD4\u8F83\uFF0C\u4F60\u4F1A\u2026\u2026",
        action: "slash",
        optionA: { label: "\u65A9\u65AD\u6BD4\u8F83\u5FC3", effect: { courage: 2 } },
        optionB: { label: "\u63A5\u7EB3\u6B64\u523B\u7684\u81EA\u5DF1", effect: { acceptance: 2 } }
      }
    ]
  },
  "story-restart": {
    id: "story-restart",
    title: "\u79BB\u5F00\u4E0D\u662F\u9003\u907F",
    opening: "\u6C88\u661F\u63E3\u7740\u51E0\u5343\u5757\uFF0C\u53BB\u4E86\u4E00\u4E2A\u6CA1\u4EBA\u8BA4\u8BC6\u5979\u7684\u57CE\u5E02\u3002",
    scenes: [
      {
        id: "scene-1",
        text: "\u5934\u4E09\u4E2A\u6708\u5F88\u96BE\u3002\u6C88\u661F\u5728\u51FA\u79DF\u5C4B\u91CC\uFF0C\u4E0D\u6B62\u4E00\u6B21\u60F3\u56DE\u53BB\u3002",
        prompt: "\u4F60\u4F1A\u600E\u4E48\u505A\uFF1F",
        action: "hug",
        optionA: { label: "\u966A\u5979\u71AC\u8FC7\u96BE\u7684\u65F6\u5019", effect: { empathy: 2 } },
        optionB: { label: "\u9F13\u52B1\u5979\u518D\u575A\u6301", effect: { courage: 2 } }
      },
      {
        id: "scene-2",
        text: "\u540E\u6765\uFF0C\u5979\u5728\u8FD9\u91CC\u9047\u5230\u4E86\u65B0\u7684\u4EBA\u3001\u65B0\u7684\u751F\u6D3B\u3002",
        prompt: "\u7406\u89E3\u5979\u7684\u9009\u62E9\u3002",
        action: "nod",
        optionA: { label: "\u8BA4\u53EF\u5979\u7684\u52C7\u6562", effect: { courage: 2 } },
        optionB: { label: "\u63A5\u7EB3\u5979\u7684\u51B3\u5B9A", effect: { acceptance: 2 } }
      },
      {
        id: "scene-3",
        text: "\u79BB\u5F00\u4E0D\u662F\u9003\u907F\uFF0C\u662F\u7ED9\u81EA\u5DF1\u4E00\u4E2A\u91CD\u65B0\u9009\u62E9\u7684\u673A\u4F1A\u3002",
        prompt: "\u9762\u5BF9\u79BB\u5F00\uFF0C\u4F60\u4F1A\u2026\u2026",
        action: "slash",
        optionA: { label: "\u65A9\u65AD\u5BF9\u8FC7\u53BB\u7684\u7EA0\u7ED3", effect: { courage: 2 } },
        optionB: { label: "\u63A5\u7EB3\u65B0\u7684\u5F00\u59CB", effect: { acceptance: 2 } }
      }
    ]
  }
};
var ENDINGS = {
  brave_start: {
    id: "brave_start",
    title: "\u52C7\u6562\u542F\u7A0B",
    text: "\u4F60\u6CA1\u6709\u505C\u5728\u539F\u5730\u3002\u4F60\u9009\u62E9\u4E86\u9762\u5BF9\uFF0C\u9009\u62E9\u4E86\u8FC8\u51FA\u90A3\u4E00\u6B65\u3002\u6709\u4E9B\u8DEF\uFF0C\u8D70\u8D77\u6765\u624D\u53D1\u73B0\u6CA1\u90A3\u4E48\u53EF\u6015\u3002",
    advice: "\u8FF7\u832B\u7684\u65F6\u5019\uFF0C\u5148\u52A8\u8D77\u6765\u3002\u65B9\u5411\u4F1A\u5728\u8DEF\u4E0A\u6162\u6162\u6E05\u6670\u3002",
    shareText: "\u6211\u5728\u300C\u70E6\u607C\u65A9\u65AD\u6240\u300D\u83B7\u5F97\u4E86\u300C\u52C7\u6562\u542F\u7A0B\u300D\u2014\u2014\u539F\u6765\u8FC8\u51FA\u7B2C\u4E00\u6B65\uFF0C\u96FE\u5C31\u6563\u4E86\u3002"
  },
  gentle_harbor: {
    id: "gentle_harbor",
    title: "\u6E29\u67D4\u505C\u9760",
    text: "\u4F60\u5B66\u4F1A\u4E86\u5141\u8BB8\u81EA\u5DF1\u505C\u4E0B\u6765\u3002\u4E0D\u6025\u7740\u627E\u7B54\u6848\uFF0C\u5148\u8BA9\u81EA\u5DF1\u5598\u53E3\u6C14\uFF0C\u4E5F\u662F\u4E00\u79CD\u524D\u8FDB\u3002",
    advice: "\u4F60\u4E0D\u9700\u8981\u9A6C\u4E0A\u627E\u5230\u7B54\u6848\uFF0C\u53EF\u4EE5\u5148\u5141\u8BB8\u81EA\u5DF1\u505C\u4E0B\u6765\u3002",
    shareText: "\u6211\u5728\u300C\u70E6\u607C\u65A9\u65AD\u6240\u300D\u83B7\u5F97\u4E86\u300C\u6E29\u67D4\u505C\u9760\u300D\u2014\u2014\u6162\u4E00\u70B9\uFF0C\u4E5F\u6CA1\u5173\u7CFB\u3002"
  },
  accompany: {
    id: "accompany",
    title: "\u966A\u4F34\u540C\u884C",
    text: "\u4F60\u7ED9\u4E88\u4E86\u7406\u89E3\u548C\u652F\u6301\u3002\u5728\u522B\u4EBA\u7684\u6545\u4E8B\u91CC\uFF0C\u4F60\u6210\u4E86\u90A3\u4E2A\u6E29\u67D4\u7684\u5B58\u5728\u2014\u2014\u800C\u8FD9\u4EFD\u6E29\u67D4\uFF0C\u4E5F\u6CBB\u6108\u4E86\u4F60\u3002",
    advice: "\u6CBB\u6108\u522B\u4EBA\u7684\u65F6\u5019\uFF0C\u5176\u5B9E\u4E5F\u5728\u6CBB\u6108\u81EA\u5DF1\u3002",
    shareText: "\u6211\u5728\u300C\u70E6\u607C\u65A9\u65AD\u6240\u300D\u83B7\u5F97\u4E86\u300C\u966A\u4F34\u540C\u884C\u300D\u2014\u2014\u539F\u6765\u6E29\u67D4\u662F\u6709\u56DE\u54CD\u7684\u3002"
  },
  still_seeking: {
    id: "still_seeking",
    title: "\u8FD8\u5728\u5BFB\u627E",
    text: "\u4F60\u8FD8\u6CA1\u6709\u627E\u5230\u7B54\u6848\uFF0C\u4F46\u8FD9\u6CA1\u5173\u7CFB\u3002\u5BFB\u627E\u672C\u8EAB\uFF0C\u5C31\u662F\u4EBA\u751F\u7684\u4E00\u90E8\u5206\u3002",
    advice: "\u4E0D\u7528\u6025\u7740\u6709\u7B54\u6848\u3002\u4FDD\u6301\u5BFB\u627E\uFF0C\u672C\u8EAB\u5C31\u662F\u4E00\u79CD\u52C7\u6C14\u3002",
    shareText: "\u6211\u5728\u300C\u70E6\u607C\u65A9\u65AD\u6240\u300D\u83B7\u5F97\u4E86\u300C\u8FD8\u5728\u5BFB\u627E\u300D\u2014\u2014\u7B54\u6848\u5728\u8DEF\u4E0A\uFF0C\u6211\u4E5F\u5728\u8DEF\u4E0A\u3002"
  }
};
function pickEnding(state) {
  if (state.courage >= 5 && state.acceptance >= 3) return ENDINGS.brave_start;
  if (state.acceptance >= 6) return ENDINGS.gentle_harbor;
  if (state.empathy >= 6) return ENDINGS.accompany;
  return ENDINGS.still_seeking;
}

// src/story/storyState.ts
function createInitialState() {
  return {
    courage: 0,
    acceptance: 0,
    empathy: 0,
    curiosity: 0,
    supportGiven: 0,
    currentTroubleId: null,
    currentSampleId: null,
    currentSceneIndex: 0,
    actions: [],
    savedSamples: []
  };
}

// src/story/storyEngine.ts
var StoryEngine = class {
  state;
  constructor() {
    this.state = createInitialState();
  }
  get trouble() {
    return this.state.currentTroubleId ? TROUBLES[this.state.currentTroubleId] : null;
  }
  get sample() {
    return this.state.currentSampleId ? SAMPLES[this.state.currentSampleId] : null;
  }
  get story() {
    return this.trouble ? LOCAL_STORIES[this.trouble.storyId] : null;
  }
  get scene() {
    const story = this.story;
    if (!story) return null;
    return story.scenes[this.state.currentSceneIndex] ?? null;
  }
  get isStoryFinished() {
    const story = this.story;
    if (!story) return false;
    return this.state.currentSceneIndex >= story.scenes.length;
  }
  /** 选择烦恼 */
  selectTrouble(troubleId) {
    this.state.currentTroubleId = troubleId;
    this.state.currentSampleId = TROUBLES[troubleId]?.sampleId ?? null;
    this.state.currentSceneIndex = 0;
  }
  /** 记录一个动作并应用其治愈效果 */
  record(action) {
    this.state.actions.push(action);
    const effect = ACTION_EFFECTS[action] ?? {};
    this.applyEffect(effect);
    return effect;
  }
  /** 应用一个选项的数值效果 */
  applyChoice(effect) {
    this.applyEffect(effect);
  }
  /** 推进到下一个场景，返回是否还有场景 */
  advanceScene() {
    this.state.currentSceneIndex += 1;
    return !this.isStoryFinished;
  }
  /** 结算结局 */
  resolveEnding() {
    return pickEnding(this.state);
  }
  /** 收藏样本 */
  saveSample(sampleId) {
    if (!this.state.savedSamples.includes(sampleId)) {
      this.state.savedSamples.push(sampleId);
    }
  }
  get savedSampleList() {
    return this.state.savedSamples.map((id) => SAMPLES[id]).filter(Boolean);
  }
  reset() {
    const savedSamples = this.state.savedSamples;
    this.state = createInitialState();
    this.state.savedSamples = savedSamples;
  }
  applyEffect(effect) {
    this.state.courage += effect.courage ?? 0;
    this.state.acceptance += effect.acceptance ?? 0;
    this.state.empathy += effect.empathy ?? 0;
    this.state.curiosity += effect.curiosity ?? 0;
  }
};

// test/engine.test.ts
var failures = 0;
function assertEq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${JSON.stringify(actual)}${ok ? "" : ` (expected ${JSON.stringify(expected)})`}`);
}
assertEq("\u52C7\u6C14\u9AD8+\u63A5\u7EB3\u9AD8 -> \u52C7\u6562\u542F\u7A0B", pickEnding({ courage: 5, acceptance: 3, empathy: 0 }).title, "\u52C7\u6562\u542F\u7A0B");
assertEq("\u63A5\u7EB3\u6781\u9AD8 -> \u6E29\u67D4\u505C\u9760", pickEnding({ courage: 0, acceptance: 6, empathy: 0 }).title, "\u6E29\u67D4\u505C\u9760");
assertEq("\u5171\u60C5\u6781\u9AD8 -> \u966A\u4F34\u540C\u884C", pickEnding({ courage: 0, acceptance: 0, empathy: 6 }).title, "\u966A\u4F34\u540C\u884C");
assertEq("\u90FD\u4E0D\u591F -> \u8FD8\u5728\u5BFB\u627E", pickEnding({ courage: 2, acceptance: 2, empathy: 2 }).title, "\u8FD8\u5728\u5BFB\u627E");
{
  const e = new StoryEngine();
  e.selectTrouble("career");
  assertEq("\u9009\u62E9\u70E6\u607C career", e.trouble?.categoryLabel, "\u804C\u4E1A\u8FF7\u832B");
  assertEq("\u6837\u672C\u5173\u8054", e.sample?.personName, "\u6797\u821F");
  assertEq("\u6545\u4E8B\u6807\u9898", e.story?.title, "\u98CE\u4ECE\u8F9E\u804C\u90A3\u5929\u5439\u6765");
  assertEq("\u573A\u666F1 \u6587\u672C\u5B58\u5728", e.scene?.id, "scene-1");
  e.record("hug");
  e.applyChoice(e.scene.optionA.effect);
  e.advanceScene();
  assertEq("\u573A\u666F2 \u6587\u672C\u5B58\u5728", e.scene?.id, "scene-2");
  e.record("slash");
  e.applyChoice(e.scene.optionA.effect);
  e.advanceScene();
  assertEq("\u573A\u666F3 \u6587\u672C\u5B58\u5728", e.scene?.id, "scene-3");
  e.record("nod");
  e.applyChoice(e.scene.optionB.effect);
  e.advanceScene();
  assertEq("\u6545\u4E8B\u8D70\u5B8C", e.isStoryFinished, true);
  const ending = e.resolveEnding();
  assertEq("\u804C\u4E1A\u8FF7\u832B\u8DEF\u5F84\u7ED3\u5C40", ending.title, "\u6E29\u67D4\u505C\u9760");
}
{
  const e = new StoryEngine();
  e.selectTrouble("selfdoubt");
  e.record("slash");
  e.record("slash");
  e.record("slash");
  assertEq("\u6325\u52513\u6B21 courage +6", e.state.courage, 6);
  e.record("hug");
  e.applyChoice({ acceptance: 2 });
  assertEq("\u6325\u5251\u4E3B\u5BFC+\u63A5\u7EB3 -> \u52C7\u6562\u542F\u7A0B", e.resolveEnding().title, "\u52C7\u6562\u542F\u7A0B");
}
console.log(failures === 0 ? "\n\u5168\u90E8\u901A\u8FC7 \u2705" : `
${failures} \u4E2A\u5931\u8D25 \u274C`);
process.exit(failures === 0 ? 0 : 1);
