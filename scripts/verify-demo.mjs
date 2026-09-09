import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const routeHeadings = ['运营工作台', '订单中心', '出库履约', '面单中心', '商品中心', '库存中心', '价格管理', 'rFBS 退货', '云仓管理', 'SKU 映射', '异常与日志', '系统设置'];
const files = await readdir('dist/assets');
const sources = await Promise.all(['dist/index.html', ...files.map((file) => join('dist/assets', file))].map((file) => readFile(file, 'utf8')));
const bundle = sources.join('\n');
const missing = routeHeadings.filter((heading) => !bundle.includes(heading));
if (missing.length) throw new Error(`构建产物缺少路由标题：${missing.join('、')}`);
if (!bundle.includes('DEMO / 演示数据')) throw new Error('构建产物缺少面单演示水印');
const forbiddenEndpoint = /(?:api-seller\.ozon\.ru|supabase\.co|localhost:\d+|\/api\/(?:orders|products|inventory|returns))/i;
if (forbiddenEndpoint.test(bundle)) throw new Error(`构建产物包含业务在线接口：${bundle.match(forbiddenEndpoint)?.[0]}`);
const html = sources[0];
if (!/src="\.\/assets\//.test(html) || !/href="\.\/assets\//.test(html)) throw new Error('构建资源不是相对路径');
console.log(`Verified ${routeHeadings.length} routes, relative assets, demo watermark, and no live endpoints.`);
