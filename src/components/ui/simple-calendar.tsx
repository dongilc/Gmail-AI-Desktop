import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface SimpleCalendarProps {
  selected?: Date;
  onSelect: (date: Date) => void;
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

export function SimpleCalendar({ selected, onSelect }: SimpleCalendarProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(selected || today);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  // 이번 달의 첫 날과 마지막 날
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // 첫 날의 요일 (0=일요일)
  const startDay = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  // 이전 달로 이동
  const prevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  // 다음 달로 이동
  const nextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  // 날짜 배열 생성
  const days: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // 날짜 선택
  const handleDateClick = (day: number) => {
    const selectedDate = new Date(year, month, day);
    onSelect(selectedDate);
  };

  // 날짜 비교
  const isSameDay = (date1: Date, date2: Date) => {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  };

  const isToday = (day: number) => {
    return isSameDay(new Date(year, month, day), today);
  };

  const isSelected = (day: number) => {
    return selected && isSameDay(new Date(year, month, day), selected);
  };

  const isPast = (day: number) => {
    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    return date < todayStart;
  };

  return (
    <div className="p-2">
      {/* 헤더: 월 네비게이션 */}
      <div className="flex items-center justify-between mb-3">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {year}년 {MONTHS[month]}
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map((day, index) => (
          <div
            key={day}
            className={cn(
              'text-center text-xs font-medium py-1',
              index === 0 && 'text-red-500',
              index === 6 && 'text-blue-500'
            )}
          >
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => (
          <div key={index} className="aspect-square">
            {day !== null && (
              <button
                onClick={() => handleDateClick(day)}
                disabled={isPast(day)}
                className={cn(
                  'w-full h-full flex items-center justify-center text-sm rounded-md transition-colors',
                  isSelected(day) && 'bg-primary text-primary-foreground',
                  !isSelected(day) && isToday(day) && 'bg-muted font-semibold',
                  !isSelected(day) && !isToday(day) && !isPast(day) && 'hover:bg-muted',
                  isPast(day) && 'text-muted-foreground/50 cursor-not-allowed',
                  index % 7 === 0 && !isSelected(day) && 'text-red-500',
                  index % 7 === 6 && !isSelected(day) && 'text-blue-500'
                )}
              >
                {day}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
