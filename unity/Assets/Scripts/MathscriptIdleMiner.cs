using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed class MathscriptIdleMiner : MonoBehaviour
    {
        public Shader towerShader;
        private MathscriptEconomy state;
        private string status = "Tower online";
        private float saveClock;
        private double savedLifetime;
        private bool smoke;
        private bool smokeLayoutFixture;
        private string SavePath => Path.Combine(Application.persistentDataPath, "mathscript-idle-miner-v1.json");
        private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        internal MathscriptEconomy State => state;
        internal string Status => status;
        internal MathscriptOfflineProgress OfflineProgress { get; private set; }
        internal float WorkElapsed(int floor) => tycoonUI == null ? float.PositiveInfinity : tycoonUI.WorkElapsed(floor);
        internal void Persist() => Save();
        internal void SetStatus(string value) => status = value;
        internal void ReplaceState(MathscriptEconomy value) => state = value;
        private MathscriptTycoonUI tycoonUI;
        internal MathscriptPerspective Perspective { get; private set; }

        private void Start()
        {
            Application.runInBackground = true;
            smoke = Array.IndexOf(Environment.GetCommandLineArgs(), "-idleMinerSmoke") >= 0;
            if (smoke) Application.logMessageReceived += ExitSmokeOnError;
            state = smoke ? new MathscriptEconomy() : MathscriptEconomy.CreateCompany();
            if (!smoke)
            {
                try
                {
                    state = MathscriptSave.Read(SavePath, Now, out double offline, out MathscriptOfflineProgress progress);
                    OfflineProgress = progress;
                    status = offline > 0 ? "Offline earnings +" + Number(offline) : progress.producedRC > 0 ? "Offline production +" + Number(progress.producedRC) + " RC" : "Tower restored";
                }
                catch (Exception exception) { status = "Save unavailable; fresh tower"; Debug.LogWarning(exception.Message); }
            }
            CreateTower();
            Perspective = gameObject.AddComponent<MathscriptPerspective>();
            Perspective.Initialize(this);
            tycoonUI = gameObject.AddComponent<MathscriptTycoonUI>();
            tycoonUI.Initialize(this);
            if (smoke) StartCoroutine(Smoke());
        }

        private void Update()
        {
            if (!smoke || !smokeLayoutFixture) state.Tick(Math.Min(Time.deltaTime, 0.5));
            saveClock += Time.deltaTime;
            if (saveClock >= 5 || state.lifetime != savedLifetime) { Save(); saveClock = 0; }
        }

        private void CreateTower()
        {
            if (towerShader == null) throw new InvalidOperationException("Tower shader is missing");
            var light = new GameObject("Tower Sun").AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.1f;
            light.transform.rotation = Quaternion.Euler(45, -30, 0);
            RenderSettings.ambientLight = new Color(0.6f, 0.65f, 0.65f);
        }

        private static string Number(double value) => MathscriptNumber.Compact(value);

        private void Save()
        {
            if (smoke || state == null) return;
            try { MathscriptSave.Write(SavePath, state, Now); savedLifetime = state.lifetime; }
            catch (Exception exception) { status = "Local save failed"; Debug.LogWarning(exception.Message); }
        }
        private void OnApplicationQuit() => Save();
        private void OnApplicationPause(bool paused) { if (paused) Save(); }
        private void ExitSmokeOnError(string message, string trace, LogType type)
        {
            if (type == LogType.Exception || type == LogType.Error || type == LogType.Assert) Application.Quit(1);
        }
        private void OnDestroy() { if (smoke) Application.logMessageReceived -= ExitSmokeOnError; }

        [Serializable]
        private sealed class BrowserSnapshot
        {
            public MathscriptEconomy state;
            public MathscriptTycoonUI.BrowserControl[] controls;
            public MathscriptTycoonUI.BrowserReadout[] readouts;
            public int width;
            public int height;
            public int frame;
            public float frameSeconds;
            public string status;
            public bool world3DOnly;
            public MathscriptOfflineProgress offline;
            public MathscriptInvestment investment;
            public MathscriptOperationsGoal goal;
            public Rect dialogBounds;
            public MathscriptPerspective.ContractVisualSnapshot contractVisual;
            public MathscriptPerspective.HeroVisualSnapshot[] heroes;
        }

    #if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void MathscriptReportSnapshot(string json);
        private bool browserSnapshotRequested;
    #endif
        public void RequestSnapshot(string request)
        {
    #if UNITY_WEBGL && !UNITY_EDITOR
            browserSnapshotRequested = true;
    #endif
        }

        private void LateUpdate()
        {
    #if UNITY_WEBGL && !UNITY_EDITOR
            if (!browserSnapshotRequested) return;
            if (state == null || tycoonUI == null) return;
            browserSnapshotRequested = false;
            MathscriptReportSnapshot(JsonUtility.ToJson(new BrowserSnapshot
            {
            state = state, controls = tycoonUI.BrowserControls(), readouts = tycoonUI.BrowserReadouts(), width = Screen.width, height = Screen.height,
            frame = Time.frameCount, frameSeconds = Time.unscaledDeltaTime,
            status = status, world3DOnly = tycoonUI.Is3DOnly, offline = OfflineProgress,
                investment = state.SuggestedInvestment, goal = state.OperationsGoal, dialogBounds = tycoonUI.DialogBounds(),
                contractVisual = Perspective.ContractVisualState(), heroes = Perspective.HeroVisualState()
            }));
    #endif
        }

        private IEnumerator Smoke()
        {
            Screen.SetResolution(1280, 800, FullScreenMode.Windowed);
            yield return new WaitForSeconds(1);
            if (Screen.width != 1280 || Screen.height != 800) throw new InvalidOperationException("Desktop fixture resolution did not apply");
            yield return tycoonUI.CheckInteractions();
            state.coins = 100000000;
            for (int floor = 1; floor < 7; floor++) state.UpgradeFloor(floor);
            while (state.PendingChallenge >= 0) state.SkipChallenge();
            state.HireFloor(0);
            state.HireFloor(1);
            state.viewport = 0;
            state.HireSector(true);
            state.HireSector(false);
            state.Generate(0);
            yield return new WaitForSeconds(8);
            if (state.compiledRC <= 0 || !MathscriptSave.Valid(state))
            {
                Debug.LogError("MATHSCRIPT_IDLE_RUNTIME_FAIL");
                Application.Quit(1);
                yield break;
            }
            yield return new WaitForEndOfFrame();
            tycoonUI.AssertLayout();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-idle-tower.png"));
            yield return new WaitForSeconds(1);
            Quaternion before = Perspective.FanRotation;
            yield return new WaitForSeconds(0.25f);
            if (Quaternion.Angle(before, Perspective.FanRotation) < 1) throw new InvalidOperationException("Managed 3D fan did not animate");
            state.viewport = 5;
            yield return null;
            if (!Perspective.FloorVisible(5) || !Perspective.FloorVisible(6) || Perspective.FloorVisible(0))
                throw new InvalidOperationException("Upper viewport room visibility did not update");
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-idle-upper.png"));
            yield return new WaitForSeconds(1);
            state.viewport = 0;
            state.challengesDone[0] = false;
            state.challengesPending[0] = true;
            yield return null;
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-idle-challenge.png"));
            yield return new WaitForSeconds(1);
            state.SkipChallenge();
            Screen.SetResolution(960, 600, FullScreenMode.Windowed);
            yield return new WaitForSeconds(1);
            if (Screen.width != 960 || Screen.height != 600) throw new InvalidOperationException("Small fixture resolution did not apply");
            yield return new WaitForEndOfFrame();
            tycoonUI.AssertLayout();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-idle-small.png"));
            yield return new WaitForSeconds(1);
            Screen.SetResolution(1280, 800, FullScreenMode.Windowed);
            yield return new WaitForSeconds(1);
            state.busManager = false;
            state.compilerManager = false;
            while (state.busState != "IDLE" || state.compilerState != "IDLE") yield return null;
            int[] visualLevels = { 1, 10, 25, 50, 10, 25, 50 };
            for (int floor = 0; floor < 7; floor++) state.levels[floor] = visualLevels[floor];
            foreach (int viewport in new[] { 0, 2, 4, 5 })
            {
                state.viewport = viewport;
                yield return new WaitForSeconds(0.1f);
                yield return new WaitForEndOfFrame();
                tycoonUI.AssertLayout();
                tycoonUI.AssertCrewLayout();
                ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-departments-" + viewport + ".png"));
                yield return new WaitForSeconds(0.5f);
            }
            Screen.SetResolution(960, 600, FullScreenMode.Windowed);
            yield return new WaitForSeconds(1);
            yield return new WaitForEndOfFrame();
            tycoonUI.AssertLayout();
            tycoonUI.AssertCrewLayout();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-evolution-small.png"));
            yield return new WaitForSeconds(0.5f);
            Debug.Log("MATHSCRIPT_DEPARTMENT_EVOLUTION_PASS");
            state.viewport = 0;
            state.hired[0] = state.hired[1] = true;
            yield return tycoonUI.CheckPerspective();
            Screen.SetResolution(1280, 800, FullScreenMode.Windowed);
            yield return new WaitForSeconds(1);
            yield return tycoonUI.CheckPerspective();
            smokeLayoutFixture = true;
            string layoutFixture = JsonUtility.ToJson(state);
            yield return new WaitForEndOfFrame();
            var baselineDescriptions = new System.Collections.Generic.List<string>();
            Rect[] logicalLayout = tycoonUI.LogicalLayoutSnapshot(baselineDescriptions);
            int depth = state.viewport;
            var camera = GameObject.Find("Perspective Camera").GetComponent<Camera>();
            Vector3 cameraPosition = camera.transform.position;
            Quaternion cameraRotation = camera.transform.rotation;
            float cameraZoom = camera.orthographicSize;
            Matrix4x4 cameraProjection = camera.projectionMatrix;
            foreach (Vector2Int size in new[] { new Vector2Int(1280, 800), new Vector2Int(390, 844), new Vector2Int(844, 390), new Vector2Int(1920, 800), new Vector2Int(800, 1280) })
            {
                smokeLayoutFixture = true;
                ReplaceState(JsonUtility.FromJson<MathscriptEconomy>(layoutFixture));
                string restoredFixture = JsonUtility.ToJson(state);
                if (restoredFixture != layoutFixture)
                    throw new InvalidOperationException("Resize fixture restore changed state before resizing; expected=" + layoutFixture + "; actual=" + restoredFixture);
                Screen.SetResolution(size.x, size.y, FullScreenMode.Windowed);
                yield return new WaitForSeconds(1);
                if (Screen.width != size.x || Screen.height != size.y) throw new InvalidOperationException("Fixed-layout fixture resolution did not apply: " + size);
                yield return new WaitForEndOfFrame();
                if (JsonUtility.ToJson(state) != layoutFixture) throw new InvalidOperationException("Resize layout fixture changed game state: " + size);
                tycoonUI.AssertLayout();
                tycoonUI.AssertCrewLayout();
                if (state.viewport != depth || Perspective.VisibleFloorCount != 3
                    || Vector3.Distance(camera.transform.position, cameraPosition) > 0.0001f || !camera.transform.rotation.Equals(cameraRotation)
                    || Mathf.Abs(camera.orthographicSize - cameraZoom) > 0.0001f || camera.projectionMatrix != cameraProjection)
                    throw new InvalidOperationException("Window resize changed the native camera or department viewport: " + size);
                var currentDescriptions = new System.Collections.Generic.List<string>();
                Rect[] current = tycoonUI.LogicalLayoutSnapshot(currentDescriptions);
                if (current.Length != logicalLayout.Length) throw new InvalidOperationException("Window resize changed controls or department count: " + size);
                float scale = MathscriptTycoonUI.ViewportScale(size.x, size.y);
                for (int element = 0; element < current.Length; element++)
                    if (Mathf.Abs(current[element].xMin - logicalLayout[element].xMin) * scale > 1
                        || Mathf.Abs(current[element].xMax - logicalLayout[element].xMax) * scale > 1
                        || Mathf.Abs(current[element].yMin - logicalLayout[element].yMin) * scale > 1
                        || Mathf.Abs(current[element].yMax - logicalLayout[element].yMax) * scale > 1)
                        throw new InvalidOperationException("Logical UI composition moved after resize: " + size + " element=" + element
                            + " baseline=" + baselineDescriptions[element] + " current=" + currentDescriptions[element]
                            + " before=" + logicalLayout[element].ToString("F4") + " after=" + current[element].ToString("F4")
                            + " physicalPositionDelta=" + ((current[element].position - logicalLayout[element].position) * scale).ToString("F4")
                            + " physicalSizeDelta=" + ((current[element].size - logicalLayout[element].size) * scale).ToString("F4"));
                for (int floor = 0; floor < 7; floor++)
                    if (Perspective.FloorVisible(floor) != (floor >= depth && floor < depth + 3))
                        throw new InvalidOperationException("Resize changed displayed departments: " + size);
                smokeLayoutFixture = false;
                yield return tycoonUI.CheckPerspective();
                yield return tycoonUI.CheckViewportDialogs();
                Debug.Log("MATHSCRIPT_FIXED_LAYOUT_NATIVE_PASS size=" + size + " scale=" + scale + " content=" + MathscriptTycoonUI.ContentBounds(size.x, size.y));
            }
            Debug.Log("MATHSCRIPT_IDLE_RUNTIME_PASS screenshot=" + Path.Combine(Application.temporaryCachePath, "mathscript-idle-tower.png"));
            Application.Quit(0);
        }
    }
}