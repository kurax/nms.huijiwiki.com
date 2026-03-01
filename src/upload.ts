import chalk from 'chalk';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pAll from 'p-all';
import pRetry from 'p-retry';
import signale from 'signale';
import dotenv from 'dotenv';

import { HuijiApiClient } from './huiji.js';

dotenv.config({ quiet: true });

const API_KEY = process.env.API_KEY;
const BOT_USER = process.env.BOT_USER;
const BOT_PASS = process.env.BOT_PASS;

const API_URL = 'https://nms.huijiwiki.com/api.php';
const BATCH_SIZE = 500;
const CONCURRENCY = 5;
const OUTPUT_DIR = path.join('output', 'file');

const sha1Hash = (data: Buffer) => crypto.createHash('sha1').update(data).digest('hex');

try {
    const files = fs
        .readdirSync(path.join(OUTPUT_DIR), { recursive: true })
        .filter((file: string | Buffer<ArrayBuffer>) => typeof file === 'string' && file.endsWith('.png')) as string[];
    const sha1: Record<string, string> = {};

    const client = new HuijiApiClient(API_URL, API_KEY);
    await client.login(BOT_USER, BOT_PASS);

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
        const imageInfo = await client.queryImageInfo(
            files.slice(i, i + BATCH_SIZE).map(file => `File:${file.replaceAll('\\', '-')}`),
            'sha1'
        );
        for (const page of imageInfo.pages) {
            if (page.missing === true) continue;
            const normalized = imageInfo.normalized.find((n: any) => n.to === page.title);
            if (normalized != null) sha1[normalized.from.replace(/^File:/, '')] = page.imageinfo[0].sha1;
        }
    }

    await pAll(
        files.map(file => () => {
            const fileName = file.replaceAll('\\', '-');
            file = path.join(OUTPUT_DIR, file);
            return pRetry(
                async () => {
                    if (sha1[fileName] === sha1Hash(await readFile(file))) {
                        signale.note(`${chalk.italic.yellowBright(fileName)} 没有更改，跳过上传`);
                        return;
                    }
                    await client.upload(fileName, (await readFile(file)).buffer, 'image/png', `更新图片数据`, '本文件为自动生成，请勿手动修改');
                    signale.success(`${chalk.italic.yellowBright(fileName)} 已上传`);
                },
                {
                    retries: 5,
                    onFailedAttempt: ({ error, attemptNumber }) => {
                        signale.error(error);
                        signale.error(`${chalk.italic.yellowBright(fileName)} 上传失败，第 ${attemptNumber}/5 次重试`);
                    }
                }
            );
        }),
        { concurrency: CONCURRENCY }
    );
} catch (err) {
    signale.error(err);
}
