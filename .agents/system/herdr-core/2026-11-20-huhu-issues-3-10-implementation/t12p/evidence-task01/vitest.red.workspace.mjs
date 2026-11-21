const root = 'D:/Document/code/huhu/temp/issue-worktrees';
export default [{ root: `${root}/safe-personal`, resolve: { alias: { '@huhu/contracts': `${root}/integration/packages/contracts/src/index.ts` } }, test: { name: 'safe-red', include: ['plugins/safe/test/safe.test.ts'] } }];
