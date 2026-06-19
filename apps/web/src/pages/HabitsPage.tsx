import { HabitCheckin } from '../components/habits/HabitCheckin.js';
import { HabitStreaks } from '../components/habits/HabitStreaks.js';
import { HabitCorrelations } from '../components/habits/HabitCorrelations.js';
import { HabitEditor } from '../components/habits/HabitEditor.js';

export default function HabitsPage() {
  return (
    <div className="space-y-4">
      <HabitCheckin />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <HabitStreaks />
        <HabitCorrelations />
      </div>
      <HabitEditor />
    </div>
  );
}
