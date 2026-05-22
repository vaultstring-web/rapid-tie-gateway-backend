import { prisma } from '../server';

interface RequestWithDestination {
  destination: string;
  startDate?: Date;
  endDate?: Date;
}

export async function enrichRequestsWithEvents<T extends RequestWithDestination>(
  requests: T[]
): Promise<(T & { events: any[]; hasRelatedEvents: boolean; eventCount: number })[]> {
  if (!requests.length) return requests as any;

  // Collect all unique destinations
  const uniqueDestinations = [...new Set(requests.map(r => r.destination))];

  // Single database call to fetch all events for all destinations
  const events = await prisma.event.findMany({
    where: {
      city: { in: uniqueDestinations, mode: 'insensitive' },
    },
    select: {
      id: true,
      name: true,
      city: true,
      country: true,
      startDate: true,
      endDate: true,
      status: true,
      category: true,
    },
  });

  // Build in-memory map: destination -> events
  const eventsByCity = new Map<string, any[]>();
  for (const event of events) {
    const city = event.city;
    if (!eventsByCity.has(city)) {
      eventsByCity.set(city, []);
    }
    eventsByCity.get(city)!.push(event);
  }

  // Filter events by date range for each request (in-memory)
  return requests.map(request => {
    let matchedEvents = eventsByCity.get(request.destination) || [];
    
    // Filter by date range if provided (in-memory, no DB call)
    if (request.startDate && request.endDate) {
      matchedEvents = matchedEvents.filter(event => 
        event.startDate <= request.endDate! && event.endDate >= request.startDate!
      );
    }
    
    // Sort by start date and limit to 10
    matchedEvents = matchedEvents
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 10);
    
    return {
      ...request,
      events: matchedEvents,
      hasRelatedEvents: matchedEvents.length > 0,
      eventCount: matchedEvents.length,
    };
  });
}