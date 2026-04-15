import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoiceCall } from "@/components/voice-call";
import type { UseVoiceCallReturn } from "@/hooks/use-voice-call";

// ---------------------------------------------------------------------------
// Mock useVoiceCall — keeps the component test free of WebSocket / VAD / AudioContext
// ---------------------------------------------------------------------------

vi.mock("@/hooks/use-voice-call");

const mockUseVoiceCall = vi.mocked((await import("@/hooks/use-voice-call")).useVoiceCall);

const defaultHook: UseVoiceCallReturn = {
  state: "idle",
  transcript: "",
  error: null,
  startCall: vi.fn().mockResolvedValue(undefined),
  endCall: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseVoiceCall.mockReturnValue({ ...defaultHook });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VoiceCall component", () => {
  describe("idle state", () => {
    it("shows 'Idle' status label", () => {
      render(<VoiceCall />);
      expect(screen.getByText(/status:.*idle/i)).toBeInTheDocument();
    });

    it("shows a 'Start call' button", () => {
      render(<VoiceCall />);
      expect(screen.getByRole("button", { name: /start call/i })).toBeInTheDocument();
    });

    it("does not show 'End call' button", () => {
      render(<VoiceCall />);
      expect(screen.queryByRole("button", { name: /end call/i })).not.toBeInTheDocument();
    });

    it("calls startCall when 'Start call' is clicked", async () => {
      const startCall = vi.fn().mockResolvedValue(undefined);
      mockUseVoiceCall.mockReturnValue({ ...defaultHook, startCall });
      render(<VoiceCall />);

      await userEvent.click(screen.getByRole("button", { name: /start call/i }));

      expect(startCall).toHaveBeenCalledOnce();
    });
  });

  describe("active states", () => {
    it.each(["listening", "processing", "speaking"] as const)(
      "shows 'End call' button when state is %s",
      (state) => {
        mockUseVoiceCall.mockReturnValue({ ...defaultHook, state });
        render(<VoiceCall />);
        expect(screen.getByRole("button", { name: /end call/i })).toBeInTheDocument();
      },
    );

    it.each(["listening", "processing", "speaking"] as const)(
      "does not show 'Start call' button when state is %s",
      (state) => {
        mockUseVoiceCall.mockReturnValue({ ...defaultHook, state });
        render(<VoiceCall />);
        expect(screen.queryByRole("button", { name: /start call/i })).not.toBeInTheDocument();
      },
    );

    it("calls endCall when 'End call' is clicked", async () => {
      const endCall = vi.fn();
      mockUseVoiceCall.mockReturnValue({ ...defaultHook, state: "listening", endCall });
      render(<VoiceCall />);

      await userEvent.click(screen.getByRole("button", { name: /end call/i }));

      expect(endCall).toHaveBeenCalledOnce();
    });

    it("shows the correct status label for each state", () => {
      const labels: Record<string, RegExp> = {
        listening: /listening/i,
        processing: /processing/i,
        speaking: /agent speaking/i,
      };

      for (const [state, label] of Object.entries(labels)) {
        const { unmount } = render(
          <VoiceCallWithState state={state as "listening" | "processing" | "speaking"} />,
        );
        expect(screen.getByText(/status:/i)).toHaveTextContent(label);
        unmount();
      }
    });
  });

  describe("transcript display", () => {
    it("shows transcript text when non-empty", () => {
      mockUseVoiceCall.mockReturnValue({
        ...defaultHook,
        state: "listening",
        transcript: "Bonjour le monde",
      });
      render(<VoiceCall />);
      expect(screen.getByText(/bonjour le monde/i)).toBeInTheDocument();
    });

    it("does not show transcript section when empty", () => {
      mockUseVoiceCall.mockReturnValue({ ...defaultHook, transcript: "" });
      render(<VoiceCall />);
      expect(screen.queryByText(/transcript:/i)).not.toBeInTheDocument();
    });
  });

  describe("error display", () => {
    it("shows error message when error is set", () => {
      mockUseVoiceCall.mockReturnValue({
        ...defaultHook,
        error: "WebSocket connection failed",
      });
      render(<VoiceCall />);
      expect(screen.getByText(/websocket connection failed/i)).toBeInTheDocument();
    });

    it("does not show error section when error is null", () => {
      mockUseVoiceCall.mockReturnValue({ ...defaultHook, error: null });
      render(<VoiceCall />);
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Helper component that drives the mock with a given state
// ---------------------------------------------------------------------------

const VoiceCallWithState = ({ state }: { state: "listening" | "processing" | "speaking" }) => {
  mockUseVoiceCall.mockReturnValue({ ...defaultHook, state });
  return <VoiceCall />;
};
