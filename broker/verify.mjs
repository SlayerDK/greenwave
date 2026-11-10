// Run the real Compose services with disposable credentials, volumes and ports.
// No application packages or host MQTT clients are needed.
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
const composeFile = join(temporary, "compose.json");
writeFileSync(envFile, "", { mode: 0o600 });
const options = ["compose", "--project-name", project, "--env-file", envFile];
const compose = [...options, "--file", composeFile];
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
    redact(`Docker command failed:\n${result.stdout}\n${result.stderr}`),
  );
  return result.stdout.trim();
}

function check(label, callback) {
  callback();
  checks += 1;
  console.log(`PASS ${label}`);
}

function exec(args, status = 0) {
  return docker([...compose, "exec", "-T", "mosquitto", ...args], status);
}

const credentials = {
  anonymous: [],
  adapter: ["-u", "adapter-aarhus", "-P", environment.MQTT_ADAPTER_PASSWORD],
  backend: ["-u", "backend", "-P", environment.MQTT_BACKEND_PASSWORD],
};

function pub(role, topic, message, extra = [], status = 0) {
  return exec(
    [
      "mosquitto_pub",
      "-h",
      "localhost",
      "-V",
      "mqttv5",
      "-q",
      "1",
      ...credentials[role],
      "-t",
      topic,
      "-m",
      message,
      ...extra,
    ],
    status,
  );
}

function sub(role, topic, extra = [], status = 0) {
  return exec(
    [
      "mosquitto_sub",
      "-h",
      "localhost",
      "-V",
      "mqttv5",
      "-W",
      "3",
      ...credentials[role],
      "-t",
      topic,
      ...extra,
    ],
    status,
  );
}

function denied(role, topic, transport = []) {
  // This image exits 0 even for a rejected QoS 1 publish. Inspect PUBACK itself.
  const output = pub(role, topic, "denied", ["-d", ...transport]);
  assert.match(output, /received PUBACK .*RC:135/);
}

const state = "greenwave/v1/aarhus/routes/broker-check/state";
const observation = "greenwave/v1/aarhus/routes/broker-check/observations";
const status = "greenwave/v1/aarhus/adapter/status";
const websocket = ["-p", "9001", "--ws"];

try {
  const config = JSON.parse(
    docker([
      ...options,
      "--file",
      join(root, "compose.yaml"),
      "config",
      "--format",
      "json",
    ]),
  );
  check("committed MQTT ports are loopback-only 1883 and 9001", () => {
    const ports = config.services.mosquitto.ports;
    assert.equal(ports.length, 2);
    for (const target of [1883, 9001]) {
      assert.ok(
        ports.some(
          (port) =>
            port.target === target &&
            port.published === String(target) &&
            port.host_ip === "127.0.0.1",
        ),
      );
    }
  });

  // Resolve the real file first, retaining absolute bind paths and healthchecks.
  // Select only our services. Never start a teammate's adapter/backend/migrate.
  const services = Object.fromEntries(
    ["postgres", "mosquitto-init", "mosquitto"].map((name) => [
      name,
      config.services[name],
    ]),
  );
  delete services.postgres.container_name;
  delete services.postgres.ports;
  services.mosquitto.ports = services.mosquitto.ports.map((port) => ({
    ...port,
    published: "0",
  }));
  const volumeNames = new Set(
    Object.values(services).flatMap((service) =>
      service.volumes
        .filter((volume) => volume.type === "volume")
        .map((volume) => volume.source),
    ),
  );
  const volumes = Object.fromEntries(
    [...volumeNames].map((name) => [name, config.volumes[name]]),
  );
  for (const volume of Object.values(volumes)) {
    assert.ok(
      !volume.external && volume.name.startsWith(`${project}_`),
      "test volumes must belong to this unique project",
    );
  }
  assert.ok(
    !config.networks.default.external &&
      config.networks.default.name === `${project}_default`,
  );
  writeFileSync(
    composeFile,
    JSON.stringify({
      services,
      volumes,
      networks: { default: config.networks.default },
    }),
    { mode: 0o600 },
  );

  console.log("Starting isolated Postgres and Mosquitto from compose.yaml...");
  started = true;
  docker(
    [
      ...compose,
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
  const brokerId = docker([...compose, "ps", "--quiet", "mosquitto"]);
  const postgresId = docker([...compose, "ps", "--quiet", "postgres"]);
  check("Postgres and broker healthy, init exited successfully", () => {
    for (const id of [brokerId, postgresId]) {
      const [container] = JSON.parse(docker(["inspect", id]));
      assert.equal(container.State.Health.Status, "healthy");
    }
    const initId = docker([
      ...compose,
      "ps",
      "--all",
      "--quiet",
      "mosquitto-init",
    ]);
    const [init] = JSON.parse(docker(["inspect", initId]));
    assert.equal(init.State.Status, "exited");
    assert.equal(init.State.ExitCode, 0);
  });
  check(
    "actual broker bindings use loopback, test Postgres has no host port",
    () => {
      const [broker, postgres] = [brokerId, postgresId].map(
        (id) => JSON.parse(docker(["inspect", id]))[0],
      );
      for (const port of ["1883/tcp", "9001/tcp"]) {
        assert.deepEqual(
          broker.NetworkSettings.Ports[port].map((binding) => binding.HostIp),
          ["127.0.0.1"],
        );
      }
      assert.equal(postgres.NetworkSettings.Ports["5432/tcp"], null);
    },
  );
  check(
    "password file has exactly two users, owner mosquitto and mode 0600",
    () => {
      assert.equal(
        exec(["stat", "-c", "%a:%U:%G", "/mosquitto/secrets/passwords"]),
        "600:mosquitto:mosquitto",
      );
      assert.equal(
        exec(["cut", "-d:", "-f1", "/mosquitto/secrets/passwords"]),
        "adapter-aarhus\nbackend",
      );
    },
  );

  pub("backend", state, "visible", ["-r"]);
  pub("adapter", observation, "private", ["-r"]);
  pub("adapter", status, "online", ["-r"]);
  check("anonymous reads retained state and adapter status", () => {
    assert.equal(sub("anonymous", state, ["-C", "1"]), "visible");
    assert.equal(sub("anonymous", status, ["-C", "1"]), "online");
  });
  check("backend reads adapter observations", () =>
    assert.equal(sub("backend", observation, ["-C", "1"]), "private"),
  );
  check("anonymous cannot read observations (bounded timeout 27)", () =>
    assert.equal(sub("anonymous", observation, [], 27), ""),
  );
  check("adapter cannot read observations or state", () => {
    for (const topic of [observation, state])
      assert.equal(sub("adapter", topic, [], 27), "");
  });
  check("backend cannot read state or adapter status", () => {
    for (const topic of [state, status])
      assert.equal(sub("backend", topic, [], 27), "");
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
    for (const topic of topics)
      check(`${role} publish denied with PUBACK 135 on ${topic}`, () =>
        denied(role, topic),
      );
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
    assert.equal(sub("anonymous", state, [...websocket, "-C", "1"]), "visible");
    assert.equal(sub("anonymous", status, [...websocket, "-C", "1"]), "online");
    assert.equal(sub("anonymous", observation, websocket, 27), "");
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
    assert.equal(sub("anonymous", state, ["-C", "1"]), "expires"),
  );
  // Only expiry needs elapsed time. All client and Docker waits are bounded.
  await new Promise((resolve) => setTimeout(resolve, 3000));
  check("expired retained state is absent (bounded timeout 27)", () =>
    assert.equal(sub("anonymous", state, [], 27), ""),
  );

  pub("adapter", observation, "", ["-r"]);
  pub("backend", state, "kept", ["-r"]);
  sub("backend", observation, [
    "-q",
    "1",
    "-c",
    "-x",
    "3600",
    "-i",
    "broker-check-backend",
    "-E",
  ]);
  pub("adapter", observation, "queued");
  docker([...compose, "restart", "mosquitto"]);
  docker(
    [
      ...compose,
      "up",
      "--detach",
      "--wait",
      "--wait-timeout",
      "60",
      "mosquitto",
    ],
    0,
    90_000,
  );
  check(
    "graceful broker restart preserves retained state and offline session",
    () => {
      assert.equal(sub("anonymous", state, ["-C", "1"]), "kept");
      assert.equal(
        sub("backend", observation, [
          "-q",
          "1",
          "-c",
          "-x",
          "3600",
          "-i",
          "broker-check-backend",
          "-C",
          "1",
        ]),
        "queued",
      );
      assert.equal(sub("anonymous", state, [...websocket, "-C", "1"]), "kept");
    },
  );

  check("init can run twice without removing either account", () => {
    for (let count = 0; count < 2; count += 1)
      docker([...compose, "run", "--rm", "--no-deps", "mosquitto-init"]);
  });
  check("empty or missing passwords leave the working file unchanged", () => {
    const hash = exec(["sha256sum", "/mosquitto/secrets/passwords"]);
    for (const name of ["MQTT_ADAPTER_PASSWORD", "MQTT_BACKEND_PASSWORD"]) {
      docker(
        [
          ...compose,
          "run",
          "--rm",
          "--no-deps",
          "--env",
          `${name}=`,
          "mosquitto-init",
        ],
        1,
      );
      assert.equal(exec(["sha256sum", "/mosquitto/secrets/passwords"]), hash);
      docker(
        [
          ...compose,
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
      assert.equal(exec(["sha256sum", "/mosquitto/secrets/passwords"]), hash);
    }
    assert.equal(
      exec([
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
  docker([...compose, "restart", "mosquitto"]);
  docker(
    [
      ...compose,
      "up",
      "--detach",
      "--wait",
      "--wait-timeout",
      "60",
      "mosquitto",
    ],
    0,
    90_000,
  );
  check(
    "both users still authenticate after init reruns and broker reload",
    () => {
      pub("adapter", observation, "both-users", ["-r"]);
      assert.equal(sub("backend", observation, ["-C", "1"]), "both-users");
      pub("backend", state, "both-users", ["-r"]);
      assert.equal(sub("anonymous", state, ["-C", "1"]), "both-users");
    },
  );
  console.log(`${checks} broker checks passed.`);
} catch (error) {
  console.error(redact(error.stack ?? error));
  if (started) {
    try {
      console.error(
        docker([...compose, "logs", "--no-color", "--tail", "60", "mosquitto"]),
      );
    } catch (logError) {
      console.error(redact(logError.message));
    }
  }
  process.exitCode = 1;
} finally {
  try {
    if (started) {
      docker([...compose, "down", "--volumes", "--remove-orphans"], 0, 90_000);
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
