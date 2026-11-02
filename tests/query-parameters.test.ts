import { describe, expect, it } from 'vitest';
import { compileQuery } from '../src/lib/db';
describe('cross-database parameter binding', () => {
  it('keeps quoted question marks intact and binds only SQL placeholders', () => {
    const input =
      "SELECT '?' literal, 'it''s ?' escaped, \"has?mark\" FROM cases WHERE id=? AND clinic_id=?";
    const pg = compileQuery(input, ['case-1', 'clinic-1'], true);
    expect(pg.sql).toBe(
      "SELECT '?' literal, 'it''s ?' escaped, \"has?mark\" FROM cases WHERE id=$1 AND clinic_id=$2",
    );
    expect(pg.params).toEqual(['case-1', 'clinic-1']);
    expect(compileQuery(input, ['case-1', 'clinic-1'], false).sql).toBe(input);
  });
  it('keeps hostile search values as data rather than SQL', () => {
    const value = "%' OR 1=1; DROP TABLE cases; --";
    const query = compileQuery('SELECT * FROM cases WHERE patient_id=?', [value], true);
    expect(query.sql).toBe('SELECT * FROM cases WHERE patient_id=$1');
    expect(query.params).toEqual([value]);
  });
  it('rejects missing or extra bound values before sending a query', () => {
    expect(() => compileQuery('SELECT ?', [1, 2], true)).toThrow('parameter count');
    expect(() => compileQuery('SELECT ?', [], false)).toThrow('parameter count');
  });
});
