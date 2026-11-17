// Verify the real Compose services without using local credentials or data.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "greenwave-broker-"));
const project = `greenwave-broker-check-${process.pid}-${randomBytes(4).toString("hex")}`;
const environment = {
  ...process.env,
  COMPOSE_PROFILES: "",
  MQTT_ADAPTER_PASSWORD: randomBytes(16).toString("hex"),
  MQTT_BACKEND_PASSWORD: randomBytes(16).toString("hex"),
};
const envFile = join(temporary, "empty.env");
const composeFile = join(root, "compose.yaml");
const overrides = join(root, "broker/verify.compose.yaml");
const snapshot = join(temporary, "compose.json");
let composeFiles = ["--file", composeFile, "--file", overrides];
writeFileSync(envFile, "", { mode: 0o600 });
const composeOptions = [
  "compose",
  "--project-name",
  project,
  "--env-file",
  envFile,
];
let started = false;
let checks = 0;

function redact(value) {
  return String(value)
    .replaceAll(environment.MQTT_ADAPTER_PASSWORD, "[redacted]")
    .replaceAll(environment.MQTT_BACKEND_PASSWORD, "[redacted]");
}

function docker(args, expectedStatus = 0, timeout = 45_000) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    expectedStatus,
    redact(`${result.stdout}\n${result.stderr}`),
  );
  return result.stdout.trim();
}

function compose(args, expectedStatus = 0, timeout = 45_000) {
  return docker(
    [...composeOptions, ...composeFiles, ...args],
    expectedStatus,
    timeout,
  );
}

function inside(args, expectedStatus = 0) {
  return compose(["exec", "-T", "mosquitto", ...args], expectedStatus);
}

function inspect(service) {
  const id = compose(["ps", "--all", "--quiet", service]);
  return JSON.parse(docker(["inspect", id]))[0];
}

function restartBroker() {
  compose(["restart", "mosquitto"]);
  compose(
    ["up", "--detach", "--wait", "--wait-timeout", "60", "mosquitto"],
    0,
    90_000,
  );
}

function check(label, callback) {
  callback();
  checks += 1;
  console.log(`PASS ${label}`);
}

const credentials = {
  anonymous: [],
  adapter: ["-u", "adapter-aarhus", "-P", environment.MQTT_ADAPTER_PASSWORD],
  backend: ["-u", "backend", "-P", environment.MQTT_BACKEND_PASSWORD],
};

function mqtt(command, role, topic, args, expectedStatus = 0) {
  return inside(
    [
      `mosquitto_${command}`,
      "-h",
      "localhost",
      "-V",
      "mqttv5",
      ...credentials[role],
      "-t",
      topic,
      ...args,
    ],
    expectedStatus,
  );
}

function pub(role, topic, message, args = []) {
  return mqtt("pub", role, topic, ["-q", "1", "-m", message, ...args]);
}

function sub(role, topic, args = [], expectedStatus = 0) {
  return mqtt("sub", role, topic, ["-W", "3", ...args], expectedStatus);
}

function expectMessage(role, topic, message, args = []) {
  assert.equal(sub(role, topic, ["-C", "1", ...args]), message);
}

function expectNoMessage(role, topic, args = []) {
  assert.equal(sub(role, topic, args, 27), "");
}

function denied(role, topic, args = []) {
  // This publisher exits 0 for a rejected publish. Check the broker's PUBACK.
  assert.match(
    pub(role, topic, "denied", ["-d", ...args]),
    /received PUBACK .*RC:135/,
  );
}

const state = "greenwave/v1/aarhus/routes/broker-check/state";
const observation = "greenwave/v1/aarhus/routes/broker-check/observations";
const status = "greenwave/v1/aarhus/adapter/status";
const websocket = ["-p", "9001", "--ws"];
const session = ["-q", "1", "-c", "-x", "3600", "-i", "broker-check-backend"];

try {
  const config = JSON.parse(
    docker([
      ...composeOptions,
      "--file",
      composeFile,
      "config",
      "--format",
      "json",
    ]),
  );
  check("committed MQTT ports are loopback-only 1883 and 9001", () => {
    assert.equal(config.services.mosquitto.ports.length, 2);
    for (const target of [1883, 9001]) {
      assert.ok(
        config.services.mosquitto.ports.some(
          (port) =>
            port.target === target &&
            port.published === String(target) &&
            port.host_ip === "127.0.0.1",
        ),
      );
    }
  });

  // The small Compose override changes only the fixed name and host ports.
  // Freeze Compose's result so concurrent edits cannot change what we clean up.
  const resolved = compose(["config", "--format", "json"]);
  const testConfig = JSON.parse(resolved);
  for (const volume of Object.values(testConfig.volumes)) {
    assert.ok(
      !volume.external && volume.name.startsWith(`${project}_`),
      "test volumes must belong to this unique project",
    );
  }
  const network = testConfig.networks.default;
  assert.ok(!network.external && network.name === `${project}_default`);
  writeFileSync(snapshot, resolved, { mode: 0o600 });
  composeFiles = ["--file", snapshot];

  console.log("Starting isolated Postgres and Mosquitto from compose.yaml...");
  started = true;
  compose(
    [
      "up",
      "--detach",
      "--wait",
      "--wait-timeout",
      "90",
      "postgres",
      "mosquitto",
    ],
    0,
    180_000,
  );
  check("Postgres and broker healthy, init exited successfully", () => {
    for (const service of ["mosquitto", "postgres"]) {
      assert.equal(inspect(service).State.Health.Status, "healthy");
    }
    const initState = inspect("mosquitto-init").State;
    assert.equal(initState.Status, "exited");
    assert.equal(initState.ExitCode, 0);
  });
  check(
    "actual broker bindings use loopback, test Postgres has no host port",
    () => {
      const ports = inspect("mosquitto").NetworkSettings.Ports;
      for (const port of ["1883/tcp", "9001/tcp"]) {
        assert.deepEqual(
          ports[port].map((binding) => binding.HostIp),
          ["127.0.0.1"],
        );
      }
      assert.equal(inspect("postgres").NetworkSettings.Ports["5432/tcp"], null);
    },
  );
  check(
    "password file has exactly two users, owner mosquitto and mode 0600",
    () => {
      assert.equal(
        inside(["stat", "-c", "%a:%U:%G", "/mosquitto/secrets/passwords"]),
        "600:mosquitto:mosquitto",
      );
      assert.equal(
        inside(["cut", "-d:", "-f1", "/mosquitto/secrets/passwords"]),
        "adapter-aarhus\nbackend",
      );
    },
  );

  pub("backend", state, "visible", ["-r"]);
  pub("adapter", observation, "private", ["-r"]);
  pub("adapter", status, "online", ["-r"]);
  check("anonymous reads retained state and adapter status", () => {
    expectMessage("anonymous", state, "visible");
    expectMessage("anonymous", status, "online");
  });
  check("backend reads adapter observations", () =>
    expectMessage("backend", observation, "private"),
  );
  check("anonymous cannot read observations (bounded timeout 27)", () =>
    expectNoMessage("anonymous", observation),
  );
  check("adapter cannot read observations or state", () => {
    for (const topic of [observation, state]) expectNoMessage("adapter", topic);
  });
  check("backend cannot read state or adapter status", () => {
    for (const topic of [state, status]) expectNoMessage("backend", topic);
  });

  for (const [role, topics] of [
    ["anonymous", [state, observation, status, "unrelated/topic"]],
    [
      "adapter",
      [
        state,
        "greenwave/v1/odense/routes/broker-check/observations",
        "greenwave/v1/odense/adapter/status",
        "unrelated/topic",
      ],
    ],
    ["backend", [observation, status, "unrelated/topic"]],
  ]) {
    for (const topic of topics) {
      check(`${role} publish denied with PUBACK 135 on ${topic}`, () =>
        denied(role, topic),
      );
    }
  }
  check(
    "wrong passwords and unknown users are refused, never anonymous",
    () => {
      for (const user of ["adapter-aarhus", "backend", "unknown"]) {
        sub("anonymous", state, ["-u", user, "-P", "deliberately-wrong"], 135);
      }
    },
  );
  check("WebSocket anonymous reads state/status with the same ACL", () => {
    expectMessage("anonymous", state, "visible", websocket);
    expectMessage("anonymous", status, "online", websocket);
    expectNoMessage("anonymous", observation, websocket);
    denied("anonymous", state, websocket);
    sub(
      "anonymous",
      state,
      [...websocket, "-u", "backend", "-P", "deliberately-wrong"],
      135,
    );
  });

  pub("backend", state, "expires", [
    "-r",
    "-D",
    "publish",
    "message-expiry-interval",
    "2",
  ]);
  check("retained MQTT 5 state is immediately readable", () =>
    expectMessage("anonymous", state, "expires"),
  );
  await new Promise((resolve) => setTimeout(resolve, 3000));
  check("expired retained state is absent (bounded timeout 27)", () =>
    expectNoMessage("anonymous", state),
  );

  pub("adapter", observation, "", ["-r"]);
  pub("backend", state, "kept", ["-r"]);
  sub("backend", observation, [...session, "-E"]);
  pub("adapter", observation, "queued");
  restartBroker();
  check(
    "graceful broker restart preserves retained state and offline session",
    () => {
      expectMessage("anonymous", state, "kept");
      expectMessage("backend", observation, "queued", session);
      expectMessage("anonymous", state, "kept", websocket);
    },
  );

  check("init can run twice without removing either account", () => {
    for (let count = 0; count < 2; count += 1) {
      compose(["run", "--rm", "--no-deps", "mosquitto-init"]);
    }
  });
  check("empty or missing passwords leave the working file unchanged", () => {
    const hash = inside(["sha256sum", "/mosquitto/secrets/passwords"]);
    for (const name of ["MQTT_ADAPTER_PASSWORD", "MQTT_BACKEND_PASSWORD"]) {
      compose(
        ["run", "--rm", "--no-deps", "--env", `${name}=`, "mosquitto-init"],
        1,
      );
      assert.equal(inside(["sha256sum", "/mosquitto/secrets/passwords"]), hash);
      compose(
        [
          "run",
          "--rm",
          "--no-deps",
          "--entrypoint",
          "/bin/sh",
          "mosquitto-init",
          "-c",
          `unset ${name}; exec /bin/sh /init.sh`,
        ],
        1,
      );
      assert.equal(inside(["sha256sum", "/mosquitto/secrets/passwords"]), hash);
    }
    assert.equal(
      inside([
        "find",
        "/mosquitto/secrets",
        "-mindepth",
        "1",
        "-maxdepth",
        "1",
        "-type",
        "d",
      ]),
      "",
    );
  });
  restartBroker();
  check(
    "both users still authenticate after init reruns and broker reload",
    () => {
      pub("adapter", observation, "both-users", ["-r"]);
      expectMessage("backend", observation, "both-users");
      pub("backend", state, "both-users", ["-r"]);
      expectMessage("anonymous", state, "both-users");
    },
  );
  console.log(`${checks} broker checks passed.`);
} catch (error) {
  console.error(redact(error.stack ?? error));
  process.exitCode = 1;
} finally {
  try {
    if (started) {
      compose(["down", "--volumes", "--remove-orphans"], 0, 90_000);
      for (const resource of ["container", "volume", "network"]) {
        assert.equal(
          docker([
            resource,
            "ls",
            "--quiet",
            "--filter",
            `label=com.docker.compose.project=${project}`,
          ]),
          "",
        );
      }
      console.log("Removed all test-owned containers, volumes and network.");
    }
  } catch (error) {
    console.error(
      redact(`Cleanup failed for project ${project}: ${error.message}`),
    );
    process.exitCode = 1;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}
