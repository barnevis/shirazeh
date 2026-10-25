// Verifies the docs service behavior with fake HTTP and markdown services.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createDocsService } from '../lib/docs-service.js';

const SIDEBAR_MARKDOWN = '- [خانه](/)\n  - [راهنما](guide)\n- [درباره](about)';

function createFakeHttp(files) {
  const calls = [];
  return {
    calls,
    async getText(url) {
      calls.push(url);
      if (Object.prototype.hasOwnProperty.call(files, url)) {
        return { status: 200, body: files[url] };
      }
      return {
        code: 'HTTP_NOT_FOUND',
        message: 'not found',
        source: 'shirazeh.http',
        type: 'operational',
        timestamp: new Date().toISOString(),
      };
    },
  };
}

function createFakeMarkdown() {
  const calls = [];
  return {
    calls,
    renderFragment(input) {
      calls.push(input);
      if (input.markdown === '###BREAK###') {
        throw new Error('render exploded');
      }
      const headings = input.markdown
        .split('\n')
        .filter((line) => line.startsWith('# '))
        .map((line, index) => ({ id: `h-${index}`, level: 1, text: line.slice(2) }));
      return { html: `<h1>${headings[0]?.text ?? ''}</h1>`, toc: headings };
    },
  };
}

function createBoundDocs({ files = {}, publish = () => {} } = {}) {
  const http = createFakeHttp(files);
  const markdown = createFakeMarkdown();
  const docs = createDocsService({ config: {}, publish });
  docs.bindDependencies({
    'shirazeh.http.service': http,
    'pey.markdown.service': markdown,
  });
  return { docs, http, markdown };
}

test('should_pass_parsneshan_extensions_when_page_is_rendered', async () => {
  const { docs, markdown } = createBoundDocs({
    files: { './docs/README.md': '# خانه', './docs/_sidebar.md': SIDEBAR_MARKDOWN },
  });

  await docs.service.getPage('/');

  const call = markdown.calls[0];
  assert.equal(Array.isArray(call.syntaxExtensions), true);
  assert.equal(Array.isArray(call.htmlExtensions), true);
  assert.equal(call.syntaxExtensions.length, 7);
  assert.equal(call.footnoteOptions?.label, 'پاورقی');
});

test('should_skip_extensions_when_disabled_in_config', async () => {
  const http = createFakeHttp({ './docs/README.md': '# خانه' });
  const markdown = createFakeMarkdown();
  const docs = createDocsService({
    config: { extensions: { admonitions: false, persianList: false, persianPoem: false, persianFootnote: false } },
    publish: () => {},
  });
  docs.bindDependencies({
    'shirazeh.http.service': http,
    'pey.markdown.service': markdown,
  });

  await docs.service.getPage('/');

  const call = markdown.calls[0];
  assert.deepEqual(call.syntaxExtensions, []);
  assert.equal(call.footnoteOptions, null);
});

test('should_return_rendered_page_when_get_page_is_called_for_home', async () => {
  const { docs } = createBoundDocs({
    files: {
      './docs/README.md': '# شیرازه\n\nمتن',
      './docs/_sidebar.md': SIDEBAR_MARKDOWN,
    },
  });

  const page = await docs.service.getPage('/');

  assert.equal(page.path, '/');
  assert.equal(page.title, 'شیرازه');
  assert.equal(page.html, '<h1>شیرازه</h1>');
  assert.equal(page.toc.length, 1);
  assert.deepEqual(page.previous, null);
  assert.deepEqual(page.next, { href: 'guide', title: 'راهنما', level: 2 });
});

test('should_return_neighbors_when_page_is_middle_of_sidebar', async () => {
  const { docs } = createBoundDocs({
    files: {
      './docs/guide.md': '# راهنما',
      './docs/_sidebar.md': SIDEBAR_MARKDOWN,
    },
  });

  const page = await docs.service.getPage('/guide');

  assert.deepEqual(page.previous, { href: '/', title: 'خانه', level: 1 });
  assert.deepEqual(page.next, { href: 'about', title: 'درباره', level: 1 });
});

test('should_publish_page_loaded_when_page_is_rendered', async () => {
  const published = [];
  const { docs } = createBoundDocs({
    files: { './docs/README.md': '# خانه', './docs/_sidebar.md': SIDEBAR_MARKDOWN },
    publish: (type, data) => published.push({ type, data }),
  });

  await docs.service.getPage('/');

  assert.deepEqual(published, [{ type: 'docs:page-loaded', data: { path: '/' } }]);
});

test('should_return_page_not_found_when_document_is_missing', async () => {
  const { docs } = createBoundDocs({ files: {} });

  const result = await docs.service.getPage('/missing');

  assert.equal(result.code, 'DOC_PAGE_NOT_FOUND');
  assert.equal(result.type, 'operational');
  assert.equal(result.source, 'shirazeh.docs');
  assert.equal(Number.isNaN(Date.parse(result.timestamp)), false);
});

test('should_not_publish_page_loaded_when_page_is_missing', async () => {
  const published = [];
  const { docs } = createBoundDocs({ files: {}, publish: (type, data) => published.push({ type, data }) });

  await docs.service.getPage('/missing');

  assert.deepEqual(published, []);
});

test('should_return_render_failed_when_markdown_rendering_fails', async () => {
  const { docs } = createBoundDocs({ files: { './docs/broken.md': '###BREAK###' } });

  const result = await docs.service.getPage('/broken');

  assert.equal(result.code, 'DOC_RENDER_FAILED');
});

test('should_return_path_invalid_when_path_is_malformed', async () => {
  const { docs } = createBoundDocs({ files: {} });

  const result = await docs.service.getPage('no-slash');

  assert.equal(result.code, 'DOC_PATH_INVALID');
});

test('should_return_sidebar_links_when_get_sidebar_is_called', async () => {
  const { docs } = createBoundDocs({ files: { './docs/_sidebar.md': SIDEBAR_MARKDOWN } });

  const links = await docs.service.getSidebar();

  assert.equal(links.length, 3);
  assert.deepEqual(links[0], { href: '/', title: 'خانه', level: 1 });
});

test('should_fetch_sidebar_once_when_get_sidebar_is_called_twice', async () => {
  const { docs, http } = createBoundDocs({ files: { './docs/_sidebar.md': SIDEBAR_MARKDOWN } });

  await docs.service.getSidebar();
  await docs.service.getSidebar();

  assert.deepEqual(http.calls, ['./docs/_sidebar.md']);
});

test('should_return_sidebar_not_found_when_sidebar_file_is_missing', async () => {
  const { docs } = createBoundDocs({ files: {} });

  const result = await docs.service.getSidebar();

  assert.equal(result.code, 'SIDEBAR_NOT_FOUND');
});

test('should_render_page_when_sidebar_is_missing_but_page_exists', async () => {
  const { docs } = createBoundDocs({ files: { './docs/README.md': '# خانه' } });

  const page = await docs.service.getPage('/');

  assert.equal(page.title, 'خانه');
  assert.deepEqual(page.previous, null);
  assert.deepEqual(page.next, null);
});

test('should_return_service_unavailable_when_deactivated', async () => {
  const { docs } = createBoundDocs({ files: { './docs/README.md': '# خانه' } });

  docs.deactivate();
  const pageResult = await docs.service.getPage('/');
  const sidebarResult = await docs.service.getSidebar();

  assert.equal(pageResult.code, 'SERVICE_UNAVAILABLE');
  assert.equal(sidebarResult.code, 'SERVICE_UNAVAILABLE');
});

test('should_return_service_unavailable_when_dependencies_are_not_bound', async () => {
  const docs = createDocsService({ config: {}, publish: () => {} });

  const result = await docs.service.getPage('/');

  assert.equal(result.code, 'SERVICE_UNAVAILABLE');
});
