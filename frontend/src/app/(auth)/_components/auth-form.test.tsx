import { AuthForm } from "@/app/(auth)/_components/auth-form";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: {
    signIn: { email: mocks.signIn },
    signUp: { email: mocks.signUp },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

const fillCredentials = () => {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "person@example.test" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "example-password" },
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.signUp.mockResolvedValue({ error: null });
});

afterEach(cleanup);

describe("AuthForm", () => {
  it("submits login with only the visible email and password fields", async () => {
    render(<AuthForm mode="login" redirectTo="/map" />);
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith({
        email: "person@example.test",
        password: "example-password",
      });
    });
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/map");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows the name error when signup is submitted without a name", async () => {
    render(<AuthForm mode="signup" redirectTo="/" />);
    fillCredentials();
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(mocks.signUp).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("submits signup with the visible name, email and password", async () => {
    render(<AuthForm mode="signup" redirectTo="/" />);
    fillCredentials();
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Test user" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => {
      expect(mocks.signUp).toHaveBeenCalledWith({
        name: "Test user",
        email: "person@example.test",
        password: "example-password",
      });
    });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
