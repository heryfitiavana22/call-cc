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
  messages: [],
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
    it("does not show a status label when idle", () => {
      render(<VoiceCall />);
      expect(
        screen.queryByText(/^(À l'écoute|En train de parler|\.\.\.)$/),
      ).not.toBeInTheDocument();
    });

    it("shows a 'Démarrer l'appel' button", () => {
      render(<VoiceCall />);
      expect(screen.getByRole("button", { name: /démarrer/i })).toBeInTheDocument();
    });

    it("does not show 'Terminer' button when idle", () => {
      render(<VoiceCall />);
      expect(screen.queryByRole("button", { name: /terminer/i })).not.toBeInTheDocument();
    });

    it("calls startCall when start button is clicked", async () => {
      const startCall = vi.fn().mockResolvedValue(undefined);
      mockUseVoiceCall.mockReturnValue({ ...defaultHook, startCall });
      render(<VoiceCall />);

      await userEvent.click(screen.getByRole("button", { name: /démarrer/i }));

      expect(startCall).toHaveBeenCalledOnce();
    });
  });

  describe("active states", () => {
    it.each(["listening", "processing", "speaking"] as const)(
      "shows 'Terminer l'appel' button when state is %s",
      (state) => {
        mockUseVoiceCall.mockReturnValue({ ...defaultHook, state });
        render(<VoiceCall />);
        expect(screen.getByRole("button", { name: /terminer/i })).toBeInTheDocument();
      },
    );

    it.each(["listening", "processing", "speaking"] as const)(
      "does not show 'Démarrer' button when state is %s",
      (state) => {
        mockUseVoiceCall.mockReturnValue({ ...defaultHook, state });
        render(<VoiceCall />);
        expect(screen.queryByRole("button", { name: /démarrer/i })).not.toBeInTheDocument();
      },
    );

    it("calls endCall when end button is clicked", async () => {
      const endCall = vi.fn();
      mockUseVoiceCall.mockReturnValue({ ...defaultHook, state: "listening", endCall });
      render(<VoiceCall />);

      await userEvent.click(screen.getByRole("button", { name: /terminer/i }));

      expect(endCall).toHaveBeenCalledOnce();
    });

    it("shows the correct status label for each state", () => {
      const labels: Record<string, RegExp> = {
        listening: /écoute/i,
        processing: /\.\.\./,
        speaking: /en train de parler/i,
      };

      for (const [state, label] of Object.entries(labels)) {
        const { unmount } = render(
          <VoiceCallWithState state={state as "listening" | "processing" | "speaking"} />,
        );
        expect(screen.getByText(label)).toBeInTheDocument();
        unmount();
      }
    });
  });

  describe("messages display", () => {
    it("shows user message text", () => {
      mockUseVoiceCall.mockReturnValue({
        ...defaultHook,
        state: "listening",
        messages: [{ id: "1", role: "user", text: "Bonjour le monde" }],
      });
      render(<VoiceCall />);
      expect(screen.getByText(/bonjour le monde/i)).toBeInTheDocument();
    });

    it("shows agent message text", () => {
      mockUseVoiceCall.mockReturnValue({
        ...defaultHook,
        state: "listening",
        messages: [{ id: "1", role: "agent", text: "Bonjour, je suis Léa !" }],
      });
      render(<VoiceCall />);
      expect(screen.getByText(/bonjour, je suis léa/i)).toBeInTheDocument();
    });

    it("shows empty state when no messages", () => {
      render(<VoiceCall />);
      expect(screen.getByText(/démarrez un appel/i)).toBeInTheDocument();
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
      expect(screen.queryByText(/connection failed/i)).not.toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Helper component
// ---------------------------------------------------------------------------

const VoiceCallWithState = ({ state }: { state: "listening" | "processing" | "speaking" }) => {
  mockUseVoiceCall.mockReturnValue({ ...defaultHook, state });
  return <VoiceCall />;
};
