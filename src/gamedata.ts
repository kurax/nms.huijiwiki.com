import { XMLParser } from 'fast-xml-parser';
import trueCasePath from 'true-case-path';
import fs from 'node:fs';
import path from 'node:path';
import signale from 'signale';
import _ from 'lodash';
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
        if (typeof localizedName === 'object') {
            const getName = () => {
                if (localizedName[key]) return localizedName[key];
                if (key === 'TencentChinese') return localizedName['SimplifiedChinese'];
                if (key === 'USEnglish') return localizedName['English'];
            };
            text = text.replaceAll('%NAME%', getName() ?? '%NAME%');
            text = text.replaceAll('%ITEM%', getName() ?? '%ITEM%');
        }
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
        if (['TkModelResource'].includes(value)) result[`[IGNORED]${name}`] = null;
        else if (obj.Property == null) {
            if (name !== 'ID' && typeof value === 'string' && localization.hasOwnProperty(value)) result[name] = getLocalizedValue(result, value);
            else result[name] = value ?? null;
        } else {
            const field = obj._attributes?._id ?? name;
            // 数组类型
            if (Array.isArray(obj.Property) && obj.Property.every((item: any) => item._attributes?.name === name && typeof item._attributes?._index === 'number')) {
                result[field] = [];
                for (const entry of _.sortBy(obj.Property, (item: any) => item._attributes?._index)) {
                    const property = getValue([entry], [...fields, field]);
                    result[field].push(typeof property[name] === 'object' ? _.omit(property[name], '_index') : property[name]);
                }
                continue;
            }
            const properties = getValue(obj.Property, [...fields, field]);
            // 枚举类型
            const enumTypes = [
                'GcAlienRace',
                'GcCorvettePartCategory',
                'GcFossilCategory',
                'GcInventoryType',
                'GcLegality',
                'GcProceduralTechnologyCategory',
                'GcProductCategory',
                'GcRarity',
                'GcRealitySubstanceCategory',
                'GcScannerIconTypes',
                'GcStatsTypes',
                'GcTechnologyCategory',
                'GcTechnologyRarity',
                'GcTradeCategory',
                'GcWeightingCurve'
            ];
            if (enumTypes.includes(value)) {
                result[field] = properties[Object.keys(properties)[0]];
                continue;
            }
            // 图片类型
            const textureTypes = ['TkTextureResource'];
            if (textureTypes.includes(value)) {
                const texture = properties.Filename;
                if (_.isEmpty(texture)) {
                    result[field] = null;
                    continue;
                }
                if (icons[texture] != null) result[field] = icons[texture].replaceAll('\\', '-');
                else {
                    const paths = texture.split('/') as string[];
                    while (paths.length > 0)
                        if (paths[0] !== 'UI') paths.shift();
                        else break;
                    const filename = [...paths.slice(0, paths.length - 1), `${path.basename(paths[paths.length - 1], path.extname(paths[paths.length - 1]))}.png`].join('/');
                    const pngFile = path.join(DATA_DIR, filename);
                    if (!fs.existsSync(pngFile)) result[field] = 'NotFound.png';
                    else {
                        icons[texture] = path.relative(path.resolve(DATA_DIR), trueCasePath.trueCasePathSync(pngFile));
                        result[field] = icons[texture].replaceAll('\\', '-');
                    }
                }
                continue;
            }
            // 其他类型
            result[field] = properties;
        }
    }
    return result;
};

const processData = async (file: string) => {
    try {
        const data = parser.parse(fs.readFileSync(path.join(REALITY_DIR, file))).Data[0];
        // fs.writeFileSync(`data/${file.replace('.MXML', '.json')}`, JSON.stringify(data, null, 2));
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
            signale.info(id, entry.NameLower?.SimplifiedChinese ?? entry.NameLower?.English);
            const file = path.join(outputDir, `${id}.json`);
            fs.writeFileSync(file, JSON.stringify({ _Table: data.type, ...entry }, null, 2));
            result.push(entry);
        } catch (error) {
            signale.error(`Error writing file ${id}.json:`, error);
        }
    }
    signale.complete(data.template);
};

const recipes = await processData('NMS_REALITY_GCRECIPETABLE.MXML');
const substances = await processData('NMS_REALITY_GCSUBSTANCETABLE.MXML');
const technologies = await processData('NMS_REALITY_GCTECHNOLOGYTABLE.MXML');
const proceduralTechnologies = await processData('NMS_REALITY_GCPROCEDURALTECHNOLOGYTABLE.MXML');
const products = await processData('NMS_REALITY_GCPRODUCTTABLE.MXML');

const getRef = (type: string, id: string) => {
    let entry: any;
    if (type === 'Substance') entry = substances.table[id];
    else if (type === 'Product') entry = products.table[id];
    // else if (type === 'Technology') entry = technologies.table[id];
    // else if (type === 'ProceduralTechnology') entry = proceduralTechnologies.table[id];
    return { Name: entry?.NameLower, Icon: entry?.Icon };
};

for (const recipe of Object.values(recipes.table) as any[]) {
    if (recipe.Result) recipe.Result = { ...recipe.Result, ...getRef(recipe.Result?.Type, recipe.Result?.Id) };
    if (recipe.Ingredients)
        for (const key in recipe.Ingredients) recipe.Ingredients[key] = { ...recipe.Ingredients[key], ...getRef(recipe.Ingredients[key]?.Type, recipe.Ingredients[key]?.Id) };
}

// Procedural Technology 后处理
for (const id in proceduralTechnologies.table) {
    const entry = proceduralTechnologies.table[id];
    if (typeof entry.Name === 'string') {
        const localizedName: Record<string, string[][]> = {};
        const addNames = (prefix: string, index: number) => {
            for (let i = 1; ; i++) {
                const key = `${prefix}_${i}`;
                const localizedValue = getLocalizedValue(entry, key);
                if (localizedValue == null) break;
                for (const locale in localizedValue) {
                    localizedName[locale] = localizedName[locale] ?? [];
                    const names: string[] = localizedName[locale][index] ?? [];
                    names[i - 1] = localizedValue[locale];
                    localizedName[locale][index] = names;
                }
            }
        };

        let rarity: string | undefined;
        if (entry.Quality === 'Normal') rarity = 'COMMON';
        else if (entry.Quality === 'Legendary') rarity = 'SCLASS';
        else if (typeof entry.Quality === 'string') rarity = entry.Quality.toUpperCase();
        if (rarity) addNames(`${entry.Name}_${rarity}_ADJ`, 0);
        addNames(`${entry.Name}_COMP`, 1);
        entry.Name = _.isEmpty(localizedName) ? entry.Name : localizedName;
    }
}

// 关联产品数据
const relateToProducts = (type: string, table: Record<string, any>) => {
    for (const id in table) {
        const relatedProducts = Object.values(products.table).filter((product: any) =>
            Object.values(product.Requirements ?? {}).some((req: any) => req.Type === type && req.ID === id)
        );
        if (relatedProducts.length === 0) continue;
        table[id]['[RELATED]Products'] = _.sortBy(
            relatedProducts.map((product: any) => ({
                Id: product.ID,
                Name: product.NameLower,
                Icon: product.Icon,
                Requirements: Object.values(product.Requirements).map((req: any) => ({ Id: req.ID, ..._.omit(req, 'ID'), ...getRef(req.Type, req.ID) }))
            })),
            p => p.Name?.SimplifiedChinese
        );
    }
};
relateToProducts('Product', products.table);
relateToProducts('Substance', substances.table);

// 关联配方数据
const relateToRecipes = (type: string, table: Record<string, any>) => {
    for (const id in table) {
        const relatedRecipes = Object.values(recipes.table).filter(
            (recipe: any) =>
                (recipe.Result?.Type === type && recipe.Result?.Id === id) ||
                Object.values(recipe.Ingredients).some((ingredient: any) => ingredient.Type === type && ingredient.Id === id)
        );
        if (relatedRecipes.length === 0) continue;
        table[id]['[RELATED]Recipes'] = _.sortBy(relatedRecipes, r => r['Result']?.Name?.SimplifiedChinese);
    }
};
relateToRecipes('Product', products.table);
relateToRecipes('Substance', substances.table);

writeTableData(substances);
writeTableData(technologies);
writeTableData(proceduralTechnologies);
writeTableData(products);

// fs.writeFileSync(path.join(DATA_DIR, 'products.json'), JSON.stringify(products.table, null, 2));

// 图片
signale.start('Icons');
for (const file of Object.values(icons)) {
    signale.info(file);
    const target = path.join(OUTPUT_DIR, 'file', file);
    if (!fs.existsSync(path.dirname(target))) fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(DATA_DIR, file), target);
}
signale.complete('Icons');
