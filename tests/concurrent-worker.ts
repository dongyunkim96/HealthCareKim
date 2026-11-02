import { editCase, saveAppointment } from '../src/lib/service';
import type { Context } from '../src/lib/types';
const input = JSON.parse(process.argv[2]);
try {
  const result =
    input.kind === 'case'
      ? editCase(input.ctx as Context, 'willow', input.edit)
      : saveAppointment(input.ctx as Context, 'willow', input.appointment);
  console.log(JSON.stringify({ success: true, result }));
} catch (e) {
  console.log(
    JSON.stringify({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
}
