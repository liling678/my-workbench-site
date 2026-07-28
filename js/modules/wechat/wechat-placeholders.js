// wechat-placeholders.js — 公众号板块入口：风格画像 + 热点·爆款 + 对标文章 + 内容生成 + 文章库 + 图片库
import { registerModule, Icons } from '../../registry.js';
import { renderStyleModule } from './style-profile.js';
import { renderHotHub } from './hot-hub.js';
import { renderContentGen } from './content-gen.js';
import { renderBenchmark } from './benchmark-articles.js';
import { renderArticleLibrary } from './article-library.js';
import { renderImageLibrary } from './image-library.js';
import { initTypeset } from './typeset.js';

export function initWechatPlaceholders() {
  // 风格画像
  registerModule('wechat-style', {
    section: 'wechat',
    title: '风格画像',
    icon: Icons.sparkles,
    render: renderStyleModule
  });

  // 热点·爆款（热点搜集 + 爆款工具箱 合并菜单）
  registerModule('wechat-hot', {
    section: 'wechat',
    title: '热点·爆款',
    icon: Icons.fire,
    render: renderHotHub
  });

  // 对标文章（独立菜单：粘贴链接自动解析）
  registerModule('wechat-benchmark', {
    section: 'wechat',
    title: '对标文章',
    icon: Icons.target,
    render: renderBenchmark
  });

  // 内容生成（5步流程）
  registerModule('wechat-gen', {
    section: 'wechat',
    title: '内容生成',
    icon: Icons.edit,
    render: renderContentGen
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

  // 公众号排版（文章+配图 → 自动排版 → 复制内联样式HTML）
  initTypeset();
}

