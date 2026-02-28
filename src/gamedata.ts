import { XMLParser } from 'fast-xml-parser';
import trueCasePath from 'true-case-path';
import fs from 'node:fs';
import path from 'node:path';
import signale from 'signale';
// import sortKeys from 'sort-keys';

const DATA_DIR = 'data';
const MXML_DIR = path.join(DATA_DIR, 'mxml');
const REALITY_DIR = path.join(MXML_DIR, 'METADATA', 'REALITY', 'TABLES');
const OUTPUT_DIR = 'output';

const localization = JSON.parse(fs.readFileSync(path.join(OUTPUT_DIR, 'localization.json'), 'utf-8'));
const icons: Record<string, string> = {};

const parser = new XMLParser({
    ignoreDeclaration: true,
    ignorePiTags: true,
    ignoreAttributes: false,
    allowBooleanAttributes: false,
    attributesGroupName: '_attributes',
    attributeNamePrefix: '',
    // attributeNamePrefix: '@',
    parseAttributeValue: true,
    processEntities: false,
    isArray: (name, jPath, isLeafNode, isAttribute) => !isAttribute
});

const spanRegex = /<([A-Z]+)>(.+?)<>/gs;
const getLocalizedValue = (data: Record<string, any>, value: string) => {
    if (!localization.hasOwnProperty(value)) return;
    const localizedName = data.NameLower ?? data.Name;
    const result: Record<string, string> = {};
    for (const key in localization[value]) {
        let text = localization[value][key];
        text = text.replace(spanRegex, (_: unknown, tag: string, content: string) => `<span class="name name-${tag.toLowerCase()}">${content}</span>`);
        if (localizedName != null) text = text.replaceAll('%ITEM%', localizedName[key] ?? '%ITEM%');
        text = text.replaceAll('\n', '<br>');
        result[key] = text;
    }
    return result;
};

const getValue = (properties: Record<string, any>[], fields: string[] = []) => {
    if (!Array.isArray(properties)) return;
    const result: Record<string, any> = {};
    for (const obj of properties) {
        const name = obj._attributes?.name;
        if (name == null) continue;
        const value = obj._attributes?.value;
        const id = obj._attributes?._id;
        if (obj.Property == null) {
            if (name !== 'ID' && typeof value === 'string' && localization.hasOwnProperty(value)) result[name] = getLocalizedValue(result, value);
            else result[name] = value ?? null;
        } else if (value === 'TkModelResource') result[`[IGNORED]${name}`] = null;
        else {
            const field = id ?? name;
            const properties = getValue(obj.Property, [...fields, field]);
            if (['GcRealitySubstanceCategory', 'GcRarity', 'GcLegality', 'GcTradeCategory', 'GcScannerIconTypes'].includes(value))
                result[name] = properties[Object.keys(properties)[0]];
            else if (value === 'TkTextureResource') {
                const texture = properties.Filename;
                if (icons[texture] != null) result[name] = icons[texture];
                else {
                    const paths = texture.split('/') as string[];
                    while (paths.length > 0)
                        if (paths[0] !== 'UI') paths.shift();
                        else break;
                    const filename = [...paths.slice(0, paths.length - 1), `${path.basename(paths[paths.length - 1], path.extname(paths[paths.length - 1]))}.png`].join('/');
                    const pngFile = path.join(DATA_DIR, filename);
                    if (!fs.existsSync(pngFile)) result[name] = 'NotFound.png';
                    else result[name] = icons[texture] = path.relative(path.resolve(DATA_DIR), trueCasePath.trueCasePathSync(pngFile)).replaceAll('\\', '/');
                }
            } else result[field] = properties;
        }
    }
    return result;
};

const processData = async (file: string) => {
    try {
        const data = parser.parse(fs.readFileSync(path.join(REALITY_DIR, file))).Data[0];
        // fs.writeFileSync('NMS_REALITY_GCSUBSTANCETABLE.json', JSON.stringify(data, null, 2));
        const template = data._attributes?.template;
        if (typeof template !== 'string') {
            signale.warn('No template found.');
            return;
        }
        const type = template.match(/Gc(\w+?)Table$/)?.[1];
        if (type == null) {
            signale.warn('No type found.');
            return;
        }
        return { template, type, table: getValue(data.Property).Table };
    } catch (error) {
        signale.error(error);
    }
};

const writeTableData = (data: Record<string, any>) => {
    signale.start(data.template);
    const outputDir = path.join(OUTPUT_DIR, 'data', data.type);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    const result: Record<string, any>[] = [];
    for (const id in data.table) {
        try {
            const entry = data.table[id];
            signale.info(id, entry.Name?.SimplifiedChinese ?? entry.Name?.English);
            const file = path.join(outputDir, `${id}.json`);
            fs.writeFileSync(file, JSON.stringify(entry, null, 2));
            result.push(entry);
        } catch (error) {
            signale.error(`Error writing file ${id}.json:`, error);
        }
    }
    signale.complete(data.template);
};

const substances = await processData('NMS_REALITY_GCSUBSTANCETABLE.MXML');

writeTableData(substances);

// 图片
signale.start('Icons');
for (const file of Object.values(icons)) {
    signale.info(file);
    const target = path.join(OUTPUT_DIR, 'file', file);
    if (!fs.existsSync(path.dirname(target))) fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(DATA_DIR, file), target);
}
signale.complete('Icons');
