using UnityEngine;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptPerspective
    {
        private static readonly Color32[] FixtureColors =
        {
            new Color32(223, 238, 255, 255), // Compute
            new Color32(194, 222, 255, 255), // GPU
            new Color32(248, 239, 217, 255), // Storage
            new Color32(248, 227, 191, 255), // Network
            new Color32(199, 235, 225, 255), // Cooling
            new Color32(216, 225, 255, 255), // Training
            new Color32(200, 240, 236, 255)  // Core
        };
        private static readonly Color32 CabinetSteel = new Color32(154, 175, 180, 255);
        private static readonly Color32 CabinetGraphite = new Color32(64, 78, 83, 255);
        private readonly Light[] departmentLights = new Light[7];
        private readonly Transform[] departmentUtilities = new Transform[7];
        private readonly Transform[] liftGate = new Transform[2];
        private Transform intakeShutter;
        private Transform intakeCargo;
        private Transform compilerProgressBar;

        private void BuildDepartmentServices(Transform floor, int department)
        {
            Color tint = FixtureColors[department];
            for (int fixture = -1; fixture <= 1; fixture++)
            {
                float x = fixture * 2.2f;
                Part(floor, "Fixture housing", new Vector3(x, 2.34f, 0.12f), new Vector3(1.43f, 0.11f, 0.26f), CabinetGraphite);
                TechPart(floor, "Ceiling fixture", new Vector3(x, 2.27f, 0.10f), new Vector3(1.28f, 0.042f, 0.16f), tint);
            }

            var lamp = new GameObject("Service chamber practical light").AddComponent<Light>();
            lamp.transform.SetParent(floor, false);
            lamp.transform.localPosition = new Vector3(0.35f, 2.12f, -0.16f);
            lamp.type = LightType.Point;
            lamp.range = 2.78f;
            lamp.shadows = LightShadows.None;
            lamp.renderMode = LightRenderMode.Auto;
            departmentLights[department] = lamp;
            SetDepartmentLight(department, owner.State.levels[department] > 0);

            var utilities = new GameObject("Department services").transform;
            utilities.SetParent(floor, false);
            departmentUtilities[department] = utilities;
            var feed = Color.Lerp(CabinetGraphite, colors[department], 0.43f);
            switch (department)
            {
                case 0:
                    BuildServiceCabinet(utilities, "Rack power distribution unit", 0.54f, 0.91f, feed);
                    for (int outlet = 0; outlet < 4; outlet++)
                        Part(utilities, "Breaker handle", new Vector3(2.72f, 0.87f + outlet * 0.12f, 0.97f), new Vector3(0.26f, 0.055f, 0.06f), CabinetGraphite);
                    break;
                case 1:
                    Part(utilities, "Extraction duct", new Vector3(1.76f, 1.88f, 1.02f), new Vector3(2.05f, 0.25f, 0.32f), CabinetSteel);
                    Part(utilities, "Extraction elbow", new Vector3(2.79f, 1.55f, 1.02f), new Vector3(0.35f, 0.66f, 0.32f), CabinetSteel);
                    Part(utilities, "Exhaust grille", new Vector3(2.79f, 1.24f, 0.82f), new Vector3(0.50f, 0.34f, 0.10f), CabinetGraphite);
                    for (int louver = 0; louver < 3; louver++)
                        Part(utilities, "Exhaust louver", new Vector3(2.79f, 1.14f + louver * 0.1f, 0.75f), new Vector3(0.42f, 0.034f, 0.045f), CabinetSteel);
                    break;
                case 2:
                    BuildServiceCabinet(utilities, "Hot spare drive cabinet", 0.79f, 0.87f, feed);
                    for (int bay = 0; bay < 3; bay++)
                        Part(utilities, "Spare drive tray", new Vector3(2.72f, 0.82f + bay * 0.22f, 0.97f), new Vector3(0.59f, 0.12f, 0.06f), CabinetGraphite);
                    break;
                case 3:
                    BuildServiceCabinet(utilities, "Fiber termination cabinet", 0.79f, 0.84f, feed);
                    for (int cable = 0; cable < 4; cable++)
                    {
                        float x = 2.47f + cable * 0.17f;
                        Color jacket = cable % 2 == 0 ? new Color32(210, 164, 60, 255) : new Color32(67, 134, 161, 255);
                        Part(utilities, "Fiber jacket", new Vector3(x, 1.22f, 0.94f), new Vector3(0.03f, 0.51f, 0.035f), jacket);
                        Part(utilities, "Fiber connector", new Vector3(x, 1.01f, 0.92f), new Vector3(0.072f, 0.075f, 0.051f), CabinetGraphite);
                    }
                    Part(utilities, "Fiber cable saddle", new Vector3(2.72f, 1.44f, 0.96f), new Vector3(0.68f, 0.054f, 0.045f), CabinetSteel);
                    break;
                case 4:
                    for (int pipe = 0; pipe < 2; pipe++)
                    {
                        float z = 1.18f + pipe * 0.25f;
                        var jacket = pipe == 0 ? new Color32(75, 145, 163, 255) : new Color32(168, 111, 78, 255);
                        Part(utilities, "Coolant header", new Vector3(0.96f, 1.93f, z), new Vector3(3.82f, 0.12f, 0.12f), jacket);
                        Part(utilities, "Pipe", new Vector3(2.83f, 1.22f, z),
                            new Vector3(0.12f, 0.72f, 0.12f), jacket, PrimitiveType.Cylinder);
                        Part(utilities, "Isolation valve", new Vector3(2.83f, 1.24f, z - 0.08f),
                            new Vector3(0.23f, 0.045f, 0.23f), CabinetSteel, PrimitiveType.Cylinder).localRotation = Quaternion.Euler(90, 0, 0);
                    }
                    break;
                case 5:
                    BuildServiceCabinet(utilities, "Training job console", 0.75f, 0.54f, feed);
                    TechPart(utilities, "Terminal display", new Vector3(2.72f, 1.12f, 0.96f), new Vector3(0.57f, 0.25f, 0.028f), new Color32(115, 155, 152, 255));
                    Part(utilities, "Console shelf", new Vector3(2.72f, 0.82f, 0.93f), new Vector3(0.82f, 0.07f, 0.42f), CabinetSteel);
                    break;
                case 6:
                    BuildServiceCabinet(utilities, "Redundant power cabinet", 0.85f, 1.25f, feed);
                    for (int branch = 0; branch < 2; branch++)
                    {
                        float x = 2.53f + branch * 0.38f;
                        Part(utilities, "Busway drop", new Vector3(x, 1.71f, 1.17f), new Vector3(0.13f, 0.64f, 0.13f), CabinetSteel);
                        Part(utilities, "Disconnect lever", new Vector3(x, 1.11f, 0.94f), new Vector3(0.13f, 0.28f, 0.09f), CabinetGraphite);
                    }
                    break;
            }
            if (department != 1 && department != 4 && department != 6)
            {
                float bottom = department == 3 ? 1.44f : department == 0 ? 1.51f : department == 2 ? 1.49f : 1.33f;
                Part(utilities, "Cable tray drop", new Vector3(2.72f, (2.04f + bottom) * 0.5f, 1.48f),
                    new Vector3(0.11f, 2.04f - bottom, 0.11f), feed);
                Part(utilities, "Conduit elbow", new Vector3(2.72f, bottom, 1.2f), new Vector3(0.11f, 0.11f, 0.56f), feed);
            }
        }

        private void BuildServiceCabinet(Transform utilities, string name, float width, float height, Color face)
        {
            const float mountY = 0.62f;
            Part(utilities, name, new Vector3(2.72f, mountY + height * 0.5f, 1.19f), new Vector3(width, height, 0.40f), CabinetSteel);
            Part(utilities, "Service cabinet door", new Vector3(2.72f, mountY + height * 0.5f, 0.98f), new Vector3(width - 0.085f, height - 0.08f, 0.055f), face);
            Part(utilities, "Service cabinet latch", new Vector3(2.72f + width * 0.42f, 0.74f, 0.945f), new Vector3(0.045f, 0.12f, 0.04f), CabinetSteel);
        }

        private void SetDepartmentLight(int department, bool open)
        {
            Light lamp = departmentLights[department];
            float intensity = open ? 1.58f : 0.55f;
            if (lamp.intensity == intensity) return;
            lamp.intensity = intensity;
            lamp.color = open ? FixtureColors[department] : new Color32(255, 197, 124, 255);
        }

        private void BuildLiftGate()
        {
            for (int index = 0; index < liftGate.Length; index++)
            {
                Transform gate = new GameObject("Sliding lift gate").transform;
                gate.SetParent(lift, false);
                liftGate[index] = gate;
                Part(gate, "Gate top rail", new Vector3(0, 0.59f, 0), new Vector3(0.48f, 0.052f, 0.045f), CabinetSteel);
                Part(gate, "Gate foot rail", new Vector3(0, -0.10f, 0), new Vector3(0.48f, 0.085f, 0.047f), CabinetGraphite);
                for (int bar = -1; bar <= 1; bar++)
                    Part(gate, "Gate bar", new Vector3(bar * 0.19f, 0.24f, 0), new Vector3(0.031f, 0.66f, 0.041f), CabinetSteel);
            }
        }

        private void BuildCompilerIntake()
        {
            Part(compiler, "Intake guide", new Vector3(-0.45f, -0.15f, -0.89f), new Vector3(0.47f, 0.052f, 0.50f), CabinetSteel);
            Part(compiler, "Intake recess", new Vector3(-0.45f, -0.007f, -0.77f), new Vector3(0.40f, 0.25f, 0.055f), CabinetGraphite);
            intakeShutter = Part(compiler, "Intake shutter", new Vector3(-0.45f, -0.007f, -0.81f), new Vector3(0.39f, 0.17f, 0.055f), CabinetSteel);
            intakeCargo = BuildCrate(compiler, Vector3.zero, new Vector3(0.30f, 0.15f, 0.26f), ActivityColor);
            intakeCargo.name = "Compiler intake cartridge";
            intakeCargo.gameObject.SetActive(false);
            Part(compiler, "Progress meter recess", new Vector3(0.29f, -0.19f, -0.65f), new Vector3(0.50f, 0.073f, 0.034f), CabinetGraphite);
            compilerProgressBar = TechPart(compiler, "Live processing progress", new Vector3(0.29f, -0.19f, -0.677f), new Vector3(0.45f, 0.036f, 0.028f), ActivityColor);
            compilerProgressBar.gameObject.SetActive(false);
        }

        private void UpdateLiftCargo(MathscriptEconomy state, float height)
        {
            bool loading = state.busState == "LOADING";
            bool unloading = state.busState == "UNLOADING";
            float progress = loading ? PhaseProgress(state.busRemaining, state.tripLoad)
                : unloading ? PhaseProgress(state.busRemaining, MathscriptEconomy.BusUnloadSeconds) : 0;
            float opening = loading || unloading ? Mathf.Min(Mathf.Clamp01(progress * 8), Mathf.Clamp01((1 - progress) * 8)) : 0;
            if (state.busState == "IDLE") opening = 1;
            for (int index = 0; index < liftGate.Length; index++)
                liftGate[index].localPosition = new Vector3((index * 2 - 1) * Mathf.Lerp(0.24f, 0.59f, opening), 0, -0.49f);

            bool collecting = loading && state.currentSlot >= 0 && state.bins[state.currentSlot] > 0 && state.busPayload < state.tripCapacity;
            delivery.gameObject.SetActive(collecting || unloading && state.busPayload > 0);
            if (collecting)
            {
                Vector3 queue = new Vector3(-2.8f, height - 0.07f, -0.70f);
                Vector3 car = lift.localPosition + new Vector3(0, 0.13f, -0.03f);
                delivery.localPosition = Vector3.Lerp(queue, car, Mathf.SmoothStep(0, 1, progress));
            }
            if (unloading)
            {
                Vector3 car = lift.localPosition + new Vector3(0, 0.13f, -0.03f);
                Vector3 staging = compiler.localPosition + new Vector3(-0.82f, -0.13f, -0.40f);
                delivery.localPosition = Vector3.Lerp(car, staging, Mathf.SmoothStep(0, 1, progress));
            }
        }

        private void UpdateCompilerIntake(MathscriptEconomy state, bool processing)
        {
            bool fetching = state.compilerState == "FETCHING" && state.compilerBuffer > 0;
            float progress = fetching ? PhaseProgress(state.compilerRemaining, MathscriptEconomy.CompilerFetchSeconds) : 0;
            float feed = Mathf.SmoothStep(0, 1, progress);
            intakeShutter.localPosition = new Vector3(-0.45f, -0.007f + 0.23f * (fetching ? Mathf.Clamp01(progress * 5) : 0), -0.81f);
            intakeCargo.gameObject.SetActive(fetching);
            if (fetching)
                intakeCargo.localPosition = Vector3.Lerp(new Vector3(-0.82f, -0.13f, -0.40f), new Vector3(-0.45f, -0.072f, -0.71f), feed);

            float completed = processing ? PhaseProgress(state.compilerRemaining, state.cycleProcessing) : 0;
            compilerProgressBar.gameObject.SetActive(processing && completed > 0);
            compilerProgressBar.localScale = new Vector3(Mathf.Max(0.001f, completed), 1, 1);
            compilerProgressBar.localPosition = new Vector3(0.065f + 0.225f * completed, -0.19f, -0.677f);
        }

        private static float PhaseProgress(double remaining, double duration) =>
            duration > 0 ? Mathf.Clamp01((float)(1 - remaining / duration)) : 1;
    }
}
