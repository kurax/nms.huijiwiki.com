import { XMLParser } from 'fast-xml-parser';
import fs from 'node:fs';
import signale from 'signale';
import sortKeys from 'sort-keys';

const LANGUAGE_DIR = 'data/language';

const parser = new XMLParser({
    ignoreDeclaration: true,
    ignorePiTags: true,
    ignoreAttributes: false,
    allowBooleanAttributes: false,
    attributesGroupName: '_attributes',
    attributeNamePrefix: '',
    // attributeNamePrefix: '@',
    // parseAttributeValue: true,
    // processEntities: false,
    isArray: (name, jPath, isLeafNode, isAttribute) => !isAttribute
});

// const data = parser.parse(fs.readFileSync('data/language/nms_loc1_english.MXML')).Data[0];
// fs.writeFileSync('nms_loc1_english.json', JSON.stringify(data, null, 2));

const localisationTable: Record<string, Record<string, string>> = {};
const regex = new RegExp(/&#x(\w+?);/g);

for (const file of fs
    .readdirSync(LANGUAGE_DIR)
    .map(file => file.toLowerCase())
    .filter(file => file.includes('english') || file.includes('chinese'))) {
    signale.info(file);
    // 解析文件
    let data = parser.parse(fs.readFileSync(`${LANGUAGE_DIR}/${file}`)).Data[0];
    if (data._attributes?.template !== 'cTkLocalisationTable') throw new Error(`文件 ${file} 不是 cTkLocalisationTable 文件`);
    if (data.Property.length !== 1) throw new Error(`文件 ${file} 结构不正确`);
    data = data.Property[0];
    if (data._attributes?.name !== 'Table' || !Array.isArray(data.Property)) throw new Error(`文件 ${file} 结构不正确`);
    data = data.Property;
    for (const entry of data)
        if (entry._attributes?.name === 'Table' && entry._attributes?.value === 'TkLocalisationEntry') {
            const id = entry._attributes._id;
            localisationTable[id] = localisationTable[id] ?? {};
            for (const item of entry.Property.filter((prop: any) => prop._attributes?.value !== '' && prop._attributes?.name !== 'Id'))
                localisationTable[id][item._attributes.name] = item._attributes.value.replace(regex, (_: unknown, value: string) => String.fromCharCode(parseInt(value, 16)));
        }
}

for (const key in localisationTable) {
    const item = localisationTable[key];
    if (item.USEnglish === item.English) delete item.USEnglish;
    if (item.TencentChinese === item.SimplifiedChinese) delete item.TencentChinese;
}

fs.writeFileSync('output/localization.json', JSON.stringify(sortKeys(localisationTable), null, 2));
