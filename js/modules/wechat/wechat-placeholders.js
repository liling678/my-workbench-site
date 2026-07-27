// wechat-placeholders.js — 公众号板块入口：风格画像 + 热点搜集 + 内容生成 + 爆款工具箱 + 文章库 + 图片库
import { registerModule, Icons } from '../../registry.js';
import { renderStyleModule } from './style-profile.js';
import { renderHotSearch } from './hot-search.js';
import { renderContentGen } from './content-gen.js';
import { renderTopicTools } from './topic-tools.js';
import { renderArticleLibrary } from './article-library.js';
import { renderImageLibrary } from './image-library.js';

export function initWechatPlaceholders() {
  // 风格画像
  registerModule('wechat-style', {
    section: 'wechat',
    title: '风格画像',
    icon: Icons.sparkles,
    render: renderStyleModule
  });

  // 热点搜集（含灵感库）
  registerModule('wechat-hot', {
    section: 'wechat',
    title: '热点搜集',
    icon: Icons.fire,
    render: renderHotSearch
  });

  // 内容生成（5步流程）
  registerModule('wechat-gen', {
    section: 'wechat',
    title: '内容生成',
    icon: Icons.edit,
    render: renderContentGen
  });

  // 爆款工具箱（爆款选题生成 + 爆款选题拆解）
  registerModule('wechat-topic-tools', {
    section: 'wechat',
    title: '爆款工具箱',
    icon: Icons.wechat,
    render: renderTopicTools
  });

  // 文章库（浏览所有保存过的文章）
  registerModule('wechat-library', {
    section: 'wechat',
    title: '文章库',
    icon: Icons.book,
    render: renderArticleLibrary
  });

  // 图片库（浏览所有生成过的图片）
  registerModule('wechat-images', {
    section: 'wechat',
    title: '图片库',
    icon: Icons.camera,
    render: renderImageLibrary
  });
}

