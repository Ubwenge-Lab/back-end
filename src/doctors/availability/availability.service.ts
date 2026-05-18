import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { format, parse, addMinutes, isBefore, isEqual, startOfDay, endOfDay } from 'date-fns';

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  async calculateSlots(doctorId: string, dateStr: string) {
    // 1. Determine the day of the week (0 = Sunday, 6 = Saturday)
    const date = parse(dateStr, 'yyyy-MM-dd', new Date());
    const dayOfWeek = date.getDay();

    // 2. Fetch the doctor's working hours for this specific day
    const schedules = await this.prisma.doctorSchedule.findMany({
      where: {
        doctorId,
        dayOfWeek,
      },
    });

    if (!schedules.length) {
      return { doctorId, date: dateStr, slots: [] };
    }

    // 3. Fetch all non-cancelled appointments for this doctor on this day
    const appointments = await this.prisma.appointment.findMany({
      where: {
        doctorId,
        date: {
          gte: startOfDay(date),
          lte: endOfDay(date),
        },
        status: { not: 'CANCELLED' }, // Assuming 'CANCELLED' is the enum value
      },
      select: { date: true },
    });

    // Map appointments to simple HH:mm strings for quick comparison
    const bookedTimes = appointments.map((app) => 
      format(app.date, 'HH:mm')
    );

    const availableSlots: string[] = [];

    // 4. Generate slots for each shift (e.g., 08:00 - 12:00, 13:00 - 17:00)
    for (const shift of schedules) {
      let currentSlot = parse(shift.startTime, 'HH:mm', date);
      const shiftEnd = parse(shift.endTime, 'HH:mm', date);

      while (isBefore(currentSlot, shiftEnd)) {
        const timeString = format(currentSlot, 'HH:mm');

        // If the slot is not in the bookedTimes list, it's available
        if (!bookedTimes.includes(timeString)) {
          availableSlots.push(timeString);
        }

        // Move to the next 30-minute interval
        currentSlot = addMinutes(currentSlot, 30);
      }
    }

    return {
      doctorId,
      date: dateStr,
      slots: availableSlots.sort(),
    };
  }
}