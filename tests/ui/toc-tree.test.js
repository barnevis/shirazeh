// Verifies the TOC tree construction for the docs page panel.

import assert from 'node:assert/strict';
import test from 'node:test';
import { activeBranchIds, buildTocTree } from '../../ui/pages/docs/toc-tree.js';

const TOC = [
  { id: 'h-1', level: 1, text: 'مقدمه' },
  { id: 'h-2', level: 2, text: 'نصب' },
  { id: 'h-3', level: 3, text: 'پیش‌نیازها' },
  { id: 'h-4', level: 2, text: 'پیکربندی' },
  { id: 'h-5', level: 3, text: 'پیشرفته' },
];

test('should_build_nested_tree_when_levels_nest', () => {
  const tree = buildTocTree(TOC);

  assert.deepEqual(tree.map((node) => node.id), ['h-1']);
  assert.deepEqual(tree[0].children.map((node) => node.id), ['h-2', 'h-4']);
  assert.deepEqual(tree[0].children[0].children.map((node) => node.id), ['h-3']);
});

test('should_keep_multiple_roots_when_top_level_repeats', () => {
  const tree = buildTocTree([
    { id: 'a', level: 1, text: 'یک' },
    { id: 'b', level: 2, text: 'زیر' },
    { id: 'c', level: 1, text: 'دو' },
  ]);

  assert.deepEqual(tree.map((node) => node.id), ['a', 'c']);
  assert.deepEqual(tree[0].children.map((node) => node.id), ['b']);
});

test('should_drop_entries_deeper_than_max_depth', () => {
  const tree = buildTocTree(TOC, 2);

  assert.deepEqual(tree[0].children.map((node) => node.id), ['h-2', 'h-4']);
  assert.deepEqual(tree[0].children[0].children, []);
});

test('should_handle_level_jumps_when_heading_skips_a_level', () => {
  const tree = buildTocTree([
    { id: 'a', level: 2, text: 'دو' },
    { id: 'b', level: 5, text: 'پنج' },
    { id: 'c', level: 3, text: 'سه' },
  ], 5);

  assert.deepEqual(tree.map((node) => node.id), ['a']);
  assert.deepEqual(tree[0].children.map((node) => node.id), ['b', 'c']);
});

test('should_return_empty_tree_when_input_is_not_an_array', () => {
  assert.deepEqual(buildTocTree(null), []);
  assert.deepEqual(buildTocTree('x'), []);
});

test('should_skip_entries_when_shape_is_invalid', () => {
  const tree = buildTocTree([{ level: 1, text: 'بدون شناسه' }, { id: 'ok', level: 1, text: 'درست' }]);

  assert.deepEqual(tree.map((node) => node.id), ['ok']);
});

test('should_fall_back_to_depth_three_when_max_depth_is_invalid', () => {
  const tree = buildTocTree(TOC, 0);

  assert.deepEqual(tree[0].children[0].children.map((node) => node.id), ['h-3']);
});

test('should_return_active_branch_when_id_exists', () => {
  const tree = buildTocTree(TOC);

  const branch = activeBranchIds(tree, 'h-3');

  assert.deepEqual([...branch].sort(), ['h-1', 'h-2', 'h-3']);
});

test('should_return_empty_branch_when_id_is_absent', () => {
  const tree = buildTocTree(TOC);

  assert.equal(activeBranchIds(tree, 'missing').size, 0);
});
