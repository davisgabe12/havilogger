import { fireEvent, render, screen, waitFor } from "@testing-library/react"

import { TimelinePanel } from "../timeline-panel"
import { TimelineEvent } from "../timeline-types"

const makeIsoForHour = (hour: number): string => {
  const now = new Date()
  const eventDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    0,
    0,
    0,
  )
  return eventDate.toISOString()
}

describe("TimelinePanel", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as jest.Mock
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  const events: TimelineEvent[] = [
    {
      id: "sleep-1",
      type: "sleep",
      title: "Overnight",
      start: makeIsoForHour(1),
      originMessageId: "msg-1",
    },
    {
      id: "diaper-1",
      type: "diaper",
      title: "Morning diaper",
      start: makeIsoForHour(7),
      originMessageId: "msg-2",
    },
  ]

  it("renders provided events and filters by type", async () => {
    const openSpy = jest.fn()
    render(<TimelinePanel childName="Lev" events={events} onOpenInChat={openSpy} />)

    expect(await screen.findByText(/Overnight/)).toBeInTheDocument()
    expect(screen.getByText(/Morning diaper/)).toBeInTheDocument()

    const sleepButton = screen.getByRole("button", { name: /sleep/i })
    fireEvent.click(sleepButton)

    await waitFor(() => {
      expect(screen.getByText(/Overnight/)).toBeInTheDocument()
      expect(screen.queryByText(/Morning diaper/)).not.toBeInTheDocument()
    })

    const sleepOpen = screen.getByText(/Open in chat/i)
    fireEvent.click(sleepOpen)
    expect(openSpy).toHaveBeenCalledWith("msg-1")
  })
})
