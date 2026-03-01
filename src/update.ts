import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import chalk from 'chalk';
import dotenv from 'dotenv';
import _ from 'lodash';
import { format } from 'lua-json';
import pAll from 'p-all';
import pRetry from 'p-retry';
import signale from 'signale';

import { HuijiApiClient } from './huiji.js';

dotenv.config({ quiet: true });

const API_KEY = process.env.API_KEY;
const BOT_USER = process.env.BOT_USER;
const BOT_PASS = process.env.BOT_PASS;

const API_URL = 'https://nms.huijiwiki.com/api.php';
const CONCURRENCY = 5;
const OUTPUT_DIR = path.join('output', 'data');

const client = new HuijiApiClient(API_URL, API_KEY);
await client.login(BOT_USER, BOT_PASS);

// 更新游戏解包数据
try {
    const files = fs
        .readdirSync(path.join(OUTPUT_DIR), { recursive: true })
        .filter((file: string | Buffer<ArrayBuffer>) => typeof file === 'string' && file.endsWith('.json')) as string[];

    await pAll(
        files.map(file => () => {
            const pageName = `Data:2026/${file.replaceAll('\\', '/')}`;
            file = path.join(OUTPUT_DIR, file);
            return pRetry(
                async () => {
                    await client.edit(pageName, await readFile(file, 'utf-8'), '更新游戏解包数据');
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
        }),
        { concurrency: CONCURRENCY }
    );
} catch (err) {
    signale.error(err);
}
