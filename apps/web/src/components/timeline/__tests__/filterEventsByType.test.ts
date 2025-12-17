import { filterEventsByType } from "../timeline-panel"
import { TimelineEvent } from "../timeline-types"

describe("filterEventsByType", () => {
  const baseEvents: TimelineEvent[] = [
    {
      id: "1",
      type: "sleep",
      title: "Overnight",
      start: "2024-06-02T02:00:00Z",
    },
    {
      id: "2",
      type: "diaper",
      title: "Morning diaper",
      start: "2024-06-02T07:00:00Z",
    },
    {
      id: "3",
      type: "sleep",
      title: "Nap",
      start: "2024-06-02T10:00:00Z",
    },
  ]

  it("returns all events for filter 'all'", () => {
    const result = filterEventsByType(baseEvents, "all")
    expect(result).toHaveLength(3)
    expect(result).toEqual(baseEvents)
  })

  it("returns only events matching the requested type", () => {
    const result = filterEventsByType(baseEvents, "sleep")
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe("1")
    expect(result[1].id).toBe("3")
  })
})
