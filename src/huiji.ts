type Multi<T> = T | T[];

const VERSION = '20250105R1';
const USER_AGENT = `KKHuijiApiClient/${VERSION}`;

export class HuijiApiClient {
    private readonly url: string;
    private readonly apiKey: string | undefined;
    private cookies: Record<string, string> = {};

    constructor(apiEp: string, apiKey?: string) {
        this.url = new URL(new URL(apiEp).pathname, apiEp).toString();
        this.apiKey = apiKey;
    }

    private createSearchParams(params: Record<string, unknown>) {
        const search = new URLSearchParams();
        const setValue = (key: string, value: unknown) => {
            const x1f = '\x1f';
            const escapeString = (str: string) => (str.includes('|') ? x1f.concat(str) : str);
            if (value == null) return;
            if (value instanceof Date) search.set(key, value.toISOString());
            else if (Array.isArray(value)) {
                const values = value.map(String);
                if (values.length > 0) search.set(key, values.some(v => v.includes('|')) ? x1f.concat(values.join(x1f)) : values.join('|'));
            } else
                switch (typeof value) {
                    case 'boolean':
                        if (value === true) search.set(key, '');
                        return;
                    case 'string':
                        search.set(key, key === 'continue' || key === 'text' ? value : escapeString(value));
                        return;
                    case 'bigint':
                    case 'number':
                        search.set(key, String(value));
                        return;
                }
        };
        for (const key in params) setValue(key, params[key]);
        search.set('format', 'json');
        search.set('formatversion', '2');
        search.set('errorformat', 'plaintext');
        // if (!search.has('utf8') && !search.has('ascii')) search.set('utf8', '');
        return search;
    }

    private checkErrors(body: any) {
        if (Array.isArray(body?.errors)) {
            const error = body.errors[0];
            const err = new Error(error.text);
            (err as any).code = error.code;
            throw err;
        }
    }

    private getCookieString() {
        return Object.entries(this.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    private extractCookies(headers: Headers) {
        const setCookieHeaders = headers.getSetCookie();
        if (!setCookieHeaders) return;

        setCookieHeaders.forEach(cookie => {
            const parts = cookie.split(';');
            const [name, value] = parts[0].split('=').map(s => s.trim());
            if (name && value) this.cookies[name] = value;
        });
    }

    async apiCall(action: string, params: Record<string, unknown>) {
        const search = this.createSearchParams({ ...params, action }).toString();
        const headers: HeadersInit = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT };

        if (this.apiKey) headers['x-authkey'] = this.apiKey;
        if (Object.keys(this.cookies).length > 0) headers['Cookie'] = this.getCookieString();

        const res = await fetch(this.url, {
            method: 'POST',
            headers,
            body: search,
            credentials: 'include'
        });

        this.extractCookies(res.headers);
        const body = await res.json();
        this.checkErrors(body);
        return body[action];
    }

    async getToken(type?: 'login' | 'csrf') {
        type = type ?? 'csrf';
        const result = await this.apiCall('query', { meta: 'tokens', type });
        if (type === 'csrf') return result.tokens.csrftoken;
        return result.tokens.logintoken;
    }

    async login(username: string, password: string) {
        const token = await this.getToken('login');
        return await this.apiCall('login', { lgname: username, lgpassword: password, lgtoken: token });
    }

    async edit(title: string, content: string, summary: string) {
        const token = await this.getToken();
        return await this.apiCall('edit', { title, text: content, summary, minor: false, bot: true, nocreate: false, createonly: false, token });
    }

    async move(from: string, to: string, reason?: string, noredirect = false) {
        const token = await this.getToken();
        return await this.apiCall('move', Object.assign({ from, to, token }, reason ? { reason } : null, noredirect ? { noredirect: 1 } : null));
    }

    async upload(name: string, file: ArrayBuffer, mimeType: string, comment?: string, text?: string) {
        const token = await this.getToken();
        const formData = new FormData();

        // 添加参数
        const params = this.createSearchParams({ action: 'upload', filename: name, async: 1, ignorewarnings: 1, token, comment, text });
        params.forEach((value, key) => {
            formData.append(key, value);
        });

        // 添加文件
        formData.append('file', new Blob([file], { type: mimeType }), name);

        const headers: HeadersInit = { 'User-Agent': USER_AGENT };
        if (this.apiKey) headers['x-authkey'] = this.apiKey;
        if (Object.keys(this.cookies).length > 0) headers['Cookie'] = this.getCookieString();

        const res = await fetch(this.url, {
            method: 'POST',
            headers,
            body: formData,
            credentials: 'include'
        });

        this.extractCookies(res.headers);
        const body = await res.json();
        this.checkErrors(body);
        return body.upload;
    }

    async queryImageInfo(titles: Multi<string>, props?: Multi<string>) {
        return await this.apiCall('query', { titles, prop: 'imageinfo', iiprop: props ?? 'url' });
    }

    async listPagesInCategory(category: string) {
        return await this.apiCall('query', { generator: 'categorymembers', gcmtitle: `Category:${category}`, gcmlimit: 'max' });
    }
}
