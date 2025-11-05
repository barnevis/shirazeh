// پلاگین سفارشی برای هایلایت کردن متن (==text==)
function highlight_plugin(md) {
  function highlight_rule(state, silent) {
    let start = state.pos;
    if (state.src.charCodeAt(start) !== 0x3D /* = */ || state.src.charCodeAt(start + 1) !== 0x3D /* = */ ) {
      return false;
    }
    let max = state.posMax;
    let pos = start + 2;
    while (pos < max) {
      if (state.src.charCodeAt(pos) === 0x3D /* = */ && state.src.charCodeAt(pos + 1) === 0x3D /* = */ ) {
        break;
      }
      pos++;
    }
    if (pos >= max - 1) {
      return false;
    }
    if (!silent) {
      let token = state.push('mark_open', 'mark', 1);
      token.markup = '==';
      token = state.push('text', '', 0);
      token.content = state.src.slice(start + 2, pos);
      token = state.push('mark_close', 'mark', -1);
      token.markup = '==';
    }
    state.pos = pos + 2;
    return true;
  }
  md.inline.ruler.before('emphasis', 'highlight', highlight_rule);
}

// پلاگین سفارشی برای جعبه‌های توضیحی (admonitions)
function admonition_plugin(md) {
  const types = {
    'هشدار': { class: 'warning', title: 'هشدار' },
    'توجه': { class: 'note', title: 'توجه' },
    'نکته': { class: 'tip', title: 'نکته' },
    'مهم': { class: 'important', title: 'مهم' },
    'احتیاط': { class: 'caution', title: 'احتیاط' }
  };

  function admonition_rule(state, startLine, endLine, silent) {
    const startMarker = '...';
    const endMarker = '...';
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    const firstLine = state.src.slice(pos, max).trim();

    if (!firstLine.startsWith(startMarker)) return false;

    const keywordWithTitle = firstLine.substring(startMarker.length).trim();
    const [keyword, ...customTitleParts] = keywordWithTitle.split(/\s+/);

    if (!types[keyword]) return false;

    let nextLine = startLine;
    let contentLines = [];

    while (true) {
      nextLine++;
      if (nextLine >= endLine) return false; // End marker not found

      pos = state.bMarks[nextLine] + state.tShift[nextLine];
      max = state.eMarks[nextLine];
      const currentLine = state.src.slice(pos, max);

      if (currentLine.trim() === endMarker) break;

      contentLines.push(currentLine);
    }

    if (silent) return true;
    
    const type = types[keyword];
    const title = customTitleParts.join(' ').trim() || type.title;

    let token;

    token = state.push('admonition_open', 'div', 1);
    token.attrs = [
      ['class', `admonition ${type.class}`]
    ];
    token.map = [startLine, nextLine + 1];

    token = state.push('admonition_title_open', 'p', 1);
    token.attrs = [
      ['class', 'admonition-title']
    ];
    
    token = state.push('inline', '', 0);
    token.content = title;
    token.children = [];

    token = state.push('admonition_title_close', 'p', -1);

    // Create a new state to correctly parse the nested content of the admonition block.
    // This is the standard and safe method for handling nested blocks in markdown-it.
    const content = contentLines.join('\n');
    const nestedState = new state.constructor(
      content,
      state.md,
      state.env,
      []
    );
    
    // Use the main block tokenizer to parse the content within the new state.
    state.md.block.tokenize(nestedState, 0, contentLines.length);

    // Append the parsed tokens from the nested state to the main token stream.
    state.tokens.push(...nestedState.tokens);

    token = state.push('admonition_close', 'div', -1);

    state.line = nextLine + 1;
    return true;
  }

  md.block.ruler.before('fence', 'admonition', admonition_rule);
}


// پلاگین سفارشی برای بازبینه‌ها (task lists)
function checklist_plugin(md) {
  md.core.ruler.after('inline', 'github-task-lists', function (state) {
    const tokens = state.tokens;
    for (let i = 2; i < tokens.length; i++) {
      if (isTodoItem(tokens, i)) {
        todoify(tokens[i], state.Token);
        tokens[i - 2].attrSet('class', 'task-list-item');
      }
    }
  });

  function isTodoItem(tokens, idx) {
    return tokens[idx].type === 'inline' &&
      tokens[idx - 1].type === 'paragraph_open' &&
      tokens[idx - 2].type === 'list_item_open' &&
      (tokens[idx].content.startsWith('[ ] ') ||
        tokens[idx].content.startsWith('[x] ') ||
        tokens[idx].content.startsWith('[X] '));
  }

  function todoify(token, Token) {
    const isChecked = token.content.startsWith('[x] ') || token.content.startsWith('[X] ');
    token.content = token.content.substring(4);

    if (token.children && token.children.length > 0) {
      for (let i = 0; i < token.children.length; i++) {
        if (token.children[i].type === 'text') {
          if (token.children[i].content.startsWith('[ ] ') ||
            token.children[i].content.startsWith('[x] ') ||
            token.children[i].content.startsWith('[X] ')) {
            token.children[i].content = token.children[i].content.substring(4);
          }
          break;
        }
      }
    }

    const checkbox = new Token('html_inline', '', 0);
    checkbox.content = `<input type="checkbox" class="task-list-item-checkbox" disabled ${isChecked ? 'checked' : ''}> `;
    const spanOpen = new Token('html_inline', '', 0);
    spanOpen.content = '<span>';
    const spanClose = new Token('html_inline', '', 0);
    spanClose.content = '</span>';

    token.children.unshift(checkbox);
    token.children.splice(1, 0, spanOpen);
    token.children.push(spanClose);
  }
}


// پلاگین سفارشی برای پشتیبانی از اعداد فارسی در لیست‌های مرتب
function persian_ordered_list_plugin(md) {
  function convertPersianToArabicNumbers(str) {
    const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
    const arabicNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    for (let i = 0; i < 10; i++) {
      str = str.replace(persianNumbers[i], arabicNumbers[i]);
    }
    return str;
  }

  function persian_list_translator(state) {
    const regex = /^(\s*)([۰-۹]+)(\.\s)/gm;
    state.src = state.src.replace(regex, (match, indentation, persianNumber, rest) => {
      const englishNumber = convertPersianToArabicNumbers(persianNumber);
      return `${indentation}${englishNumber}${rest}`;
    });
  }

  md.core.ruler.before('block', 'persian_ordered_list', persian_list_translator);
}


// پلاگین سفارشی برای نمایش شعر
function poetry_plugin(md) {
  function poetry_rule(state, startLine, endLine, silent) {
    const startMarker = '...شعر';
    const endMarker = '...';
    let pos = state.bMarks[startLine] + state.tShift[startLine];
    let max = state.eMarks[startLine];
    let firstLine = state.src.slice(pos, max).trim();

    if (firstLine !== startMarker) return false;

    let nextLine = startLine;
    let verses = [];

    while (true) {
        nextLine++;
        if (nextLine >= endLine) return false;

        pos = state.bMarks[nextLine] + state.tShift[nextLine];
        max = state.eMarks[nextLine];
        let currentLine = state.src.slice(pos, max).trim();

        if (currentLine === endMarker) break;

        if (currentLine === '') {
            verses.push({ type: 'separator' });
        } else {
            verses.push({ type: 'verse', content: currentLine });
        }
    }

    if (silent) return true;

    let token;

    token = state.push('poetry_open', 'div', 1);
    token.attrs = [['class', 'poetry-container']];
    token.block = true;

    let currentStanza = [];
    for (let i = 0; i < verses.length; i++) {
        if (verses[i].type === 'separator') {
            if (currentStanza.length > 0) {
                renderStanza(state, currentStanza);
                currentStanza = [];
            }
        } else {
            currentStanza.push(verses[i].content);
        }
    }
    if (currentStanza.length > 0) {
        renderStanza(state, currentStanza);
    }
    token = state.push('poetry_close', 'div', -1);

    state.line = nextLine + 1;
    return true;
  }

  function renderStanza(state, lines) {
    let token;
    token = state.push('stanza_open', 'div', 1);
    token.attrs = [['class', 'poetry-stanza']];

    for (let line of lines) {
        token = state.push('verse_open', 'p', 1);
        token.attrs = [['class', 'poetry-verse']];
        token = state.push('inline', '', 0);
        token.content = line;
        token.children = [];
        token = state.push('verse_close', 'p', -1);
    }
    token = state.push('stanza_close', 'div', -1);
  }

  md.block.ruler.before('fence', 'poetry', poetry_rule);
}


// پلاگین هوشمند برای تشخیص خودکار جهت متن
function auto_direction_plugin(md) {
  /**
   * Detects the appropriate direction for a line of text based on its content.
   * - If any Farsi/Arabic character is present, it's 'rtl'.
   * - If it's English-only and short (<= 3 words), it's treated as 'rtl' (e.g., a title).
   * - If it's English-only and long (> 3 words), it's treated as 'ltr' (e.g., a paragraph).
   * - Defaults to 'rtl' for neutral or empty strings.
   * @param {string} text - The text content to analyze.
   * @returns {'rtl' | 'ltr'}
   */
  function detectDirection(text) {
    const rtlRegex = /[\u0600-\u06FF]/;
    // Priority 1: If any RTL character exists, the whole block is RTL.
    if (rtlRegex.test(text)) {
      return 'rtl';
    }

    const ltrRegex = /[a-zA-Z]/;
    // Priority 2: If no RTL chars, check for LTR chars.
    if (ltrRegex.test(text)) {
      // Heuristic for LTR-only content.
      const words = text.trim().split(/\s+/).length;
      if (words > 3) { // Long enough to be considered a full LTR paragraph.
        return 'ltr';
      }
    }
    
    // Default to RTL for short LTR-only lines (titles/labels) or neutral content.
    return 'rtl';
  }

  const blockRules = [
    'paragraph_open', 'heading_open', 'list_item_open', 
    'blockquote_open', 'table_open'
  ];

  blockRules.forEach(ruleName => {
    const originalRule = md.renderer.rules[ruleName] || function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules[ruleName] = function (tokens, idx, options, env, self) {
      const token = tokens[idx];
      let content = '';
      let contentToken = null;

      if (ruleName === 'table_open') {
        for (let j = idx + 1; j < tokens.length; j++) {
            if (tokens[j].type === 'table_close') break;
            if (tokens[j].type === 'inline') {
                content = tokens[j].content;
                break;
            }
        }
      } else {
        for(let j = idx + 1; j < tokens.length; j++) {
          if (tokens[j].type === `${ruleName.replace('_open', '_close')}`) break;
          if (tokens[j].type === 'inline' && tokens[j].content) {
            content = tokens[j].content;
            contentToken = tokens[j];
            break;
          }
        }
      }

      if (content) {
        const direction = detectDirection(content);
        token.attrSet('dir', direction);
        if (contentToken) {
            contentToken.attrSet('dir', direction);
        }
      }

      return originalRule(tokens, idx, options, env, self);
    };
  });
}

// پلاگین برای بازنویسی لینک‌های داخلی و خارجی
function link_rewriter_plugin(md) {
  const defaultRender = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex < 0) return defaultRender(tokens, idx, options, env, self);

    let href = token.attrs[hrefIndex][1];

    const isExternal = /^(https?:|mailto:|tel:|data:)/.test(href);
    const isAnchorOnly = href.startsWith('#');
    const isInternalPage = href.startsWith('/') && !href.startsWith('//');

    if (isExternal) {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    } else if (isAnchorOnly) {
      // For same-page anchors, construct a full hash path that the router can handle.
      // The router expects #/path/to/page#anchor.
      const currentPagePath = window.location.hash.substring(1).split('#')[0] || '/';
      const newHref = `#${currentPagePath}${href}`;
      // Sanitize for root path, e.g., #//#anchor -> #/#anchor
      token.attrs[hrefIndex][1] = newHref.replace('//', '/'); 
    } else if (isInternalPage) {
      // For cross-page links, just prepend the main hash for the router.
      token.attrs[hrefIndex][1] = `#${href}`;
    }
    
    return defaultRender(tokens, idx, options, env, self);
  };
}


export function createParsNeshan(options = {}) {
  const { plugins = [], ...mdOptions } = options;

  const md = window.markdownit({
    html: true,
    ...mdOptions 
  });

  md.use(highlight_plugin);
  md.use(admonition_plugin);
  md.use(checklist_plugin);
  md.use(persian_ordered_list_plugin);
  md.use(poetry_plugin);
  md.use(auto_direction_plugin);
  md.use(link_rewriter_plugin);

  plugins.forEach(pluginConfig => {
    if (Array.isArray(pluginConfig)) {
      md.use(...pluginConfig);
    } else {
      md.use(pluginConfig);
    }
  });
  return md;
}