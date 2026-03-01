import { readFile } from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import dotenv from 'dotenv';
import _ from 'lodash';
import { format } from 'lua-json';
import pRetry from 'p-retry';
import signale from 'signale';

import { HuijiApiClient } from './huiji.js';

dotenv.config({ quiet: true });

const API_KEY = process.env.API_KEY;
const BOT_USER = process.env.BOT_USER;
const BOT_PASS = process.env.BOT_PASS;

const API_URL = 'https://nms.huijiwiki.com/api.php';

const client = new HuijiApiClient(API_URL, API_KEY);
await client.login(BOT_USER, BOT_PASS);

// 更新游戏基础数据
try {
    const data: Record<string, any> = {};
    const localization = JSON.parse(await readFile(path.join('output', 'localization.json'), 'utf-8'));
    for (const key of Object.keys(localization).filter(key => key.startsWith('SUB_SIMPLE_CAT_'))) {
        data.SubstanceCategory = data.SubstanceCategory ?? {};
        data.SubstanceCategory[_.capitalize(key.replace('SUB_SIMPLE_CAT_', ''))] = localization[key];
    }
    const pageName = 'Module:CommonData';
    await pRetry(
        async () => {
            await client.edit(pageName, format(data), '内容自动更新，请勿手动修改');
            signale.success(`${chalk.italic.yellowBright(pageName)} 已更新`);
        },
        {
            retries: 5,
            onFailedAttempt: ({ error, attemptNumber }) => {
                signale.error(error);
                signale.error(`${chalk.italic.yellowBright(pageName)} 更新失败，第 ${attemptNumber}/5 次重试`);
            }
        }
    );
} catch (err) {
    signale.error(err);
}
