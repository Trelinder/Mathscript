using System.Collections.Generic;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptPerspective : MonoBehaviour
    {
        public const float FloorPitch = 2.7f;
        public const float CrewScale = 1.02f;
        public static float DeckY(int floor) => -FloorPitch * (floor + 1);
        public static float SlotY(int viewport, int slot) => slot < 0 ? 0.35f : DeckY(slot) + 0.35f;
        public int VisibleFloorCount => MathscriptTycoonUI.IsPortraitViewport(framedWidth > 0 ? framedWidth : Screen.width, framedHeight > 0 ? framedHeight : Screen.height)
            || MathscriptTycoonUI.IsCompactLandscape(framedWidth > 0 ? framedWidth : Screen.width, framedHeight > 0 ? framedHeight : Screen.height) ? 1 : 3;
        public Vector2 LandingScreenPosition(int floor) => sceneCamera.WorldToScreenPoint(new Vector3(100, DeckY(floor) + 1.2f, 0));
        public void SetFrameRect(Rect value) { logicalFrame = value; FrameCamera(); }
        internal Vector3 WorkerPosition(int floor) => workers[floor, 0].position;
        internal Vector3 LiftPosition => lift.position;
        internal Vector3 DeliveryPosition => delivery.position;
        internal bool DeliveryVisible => delivery.gameObject.activeInHierarchy;
        internal bool FloorVisible(int floor) => floors[floor].gameObject.activeInHierarchy;
        internal Quaternion FanRotation => coolingFans[1, 0].rotation;
        private MathscriptIdleMiner owner;
        private Camera sceneCamera;
        private Camera clearCamera;
        private Transform stageRoot;
        private readonly Transform[] floors = new Transform[7];
        private readonly Transform[,] workers = new Transform[7, 4];
        private readonly MathscriptWorker[,] crewRigs = new MathscriptWorker[7, 4];
        private readonly Transform[] stock = new Transform[7];
        private readonly Transform[] seals = new Transform[7];
        private readonly Transform[,] machines = new Transform[7, 5];
        private Transform lift;
        private Transform liftCargo;
        private Transform compiler;
        private Transform delivery;
        private Light sunlight;
        private Material previousSkybox;
        private Material atmosphereSky;
        private Light previousSun;
        private Transform sky;
        private Transform sun;
        private Transform moon;
        private Transform starfield;
        private Transform radar;
        private readonly List<Transform> clouds = new List<Transform>();
        private readonly List<Material> skyMaterials = new List<Material>();
        private readonly List<Material> techMaterials = new List<Material>();
        private readonly Dictionary<Material, Material> poweredMaterials = new Dictionary<Material, Material>();
        private readonly List<Transform> trees = new List<Transform>();
        private readonly List<float> treeYaw = new List<float>();
        private readonly Transform[,] coolingFans = new Transform[7, 5];
        private readonly Transform[,] workloadLights = new Transform[7, 5];
        private readonly Transform[] queueLights = new Transform[7];
        private Transform processingRotor;
        private Transform processingLight;
        private Transform processingQueue;
        private Transform payoutLight;
        private double displayedCompiled;
        private double displayedContractIncome;
        private float payoutRemaining;
        private static readonly Color ActivityColor = new Color32(36,190,174,255);
        private static readonly Color QueueColor = new Color32(239,191,65,255);
        private static readonly Color PayoutColor = new Color32(78,191,116,255);
        private float atmosphereElapsed;
        private float? fixedAtmosphere;
        private readonly MathscriptWorker[] heroes = new MathscriptWorker[7];
        private bool visible;
        private MathscriptSurfaces surfaces;
        private int framedWidth = -1;
        private int framedHeight = -1;
        private int framedViewport = -1;
        private Rect framedRect;
        private Rect logicalFrame = new Rect(0, 0, MathscriptTycoonUI.LogicalWidth, MathscriptTycoonUI.LogicalHeight);
        private readonly Color[] colors = {
            new Color32(36,190,174,255), new Color32(240,112,96,255),
            new Color32(75,166,224,255), new Color32(239,191,65,255),
            new Color32(78,191,116,255), new Color32(128,153,217,255), new Color32(110,214,198,255) };

        public void Initialize(MathscriptIdleMiner game)
        {
            owner = game;
            surfaces = new MathscriptSurfaces(owner.towerShader);
            clearCamera = new GameObject("Data center background camera").AddComponent<Camera>();
            clearCamera.clearFlags = CameraClearFlags.SolidColor;
            clearCamera.backgroundColor = new Color32(38,50,56,255);
            clearCamera.cullingMask = 0;
            clearCamera.depth = -2;
            sceneCamera = new GameObject("Perspective Camera").AddComponent<Camera>();
            sceneCamera.depth = -1;
            sceneCamera.enabled = false;
            sceneCamera.transform.position = new Vector3(108, 7.5f, -15);
            sceneCamera.transform.LookAt(new Vector3(100, 2.3f, 0));
            sceneCamera.fieldOfView = 36;
            sceneCamera.nearClipPlane = 0.1f;
            sceneCamera.farClipPlane = 80;
            sceneCamera.allowHDR = true;
            sceneCamera.allowMSAA = true;
            sceneCamera.orthographic = true;
            sceneCamera.backgroundColor = new Color32(185, 221, 231, 255);
            sceneCamera.clearFlags = CameraClearFlags.SolidColor;
            sceneCamera.rect = new Rect(0, 0, 1, 1);
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadows = ShadowQuality.All;
            QualitySettings.shadowResolution = ShadowResolution.High;
            QualitySettings.shadowDistance = 34;
            QualitySettings.shadowCascades = 2;
            QualitySettings.pixelLightCount = 2;
            QualitySettings.anisotropicFiltering = AnisotropicFiltering.Enable;
            QualitySettings.vSyncCount = 1;
            Application.targetFrameRate = 60;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.62f, 0.68f, 0.74f);
            RenderSettings.ambientEquatorColor = new Color(0.36f, 0.4f, 0.43f);
            RenderSettings.ambientGroundColor = new Color(0.2f, 0.22f, 0.24f);
            previousSkybox = RenderSettings.skybox;
            previousSun = RenderSettings.sun;
            var key = GameObject.Find("Tower Sun").GetComponent<Light>();
            sunlight = key;
            key.shadows = LightShadows.Soft;
            key.shadowStrength = 0.52f;
            key.shadowBias = 0.025f;
            key.shadowNormalBias = 0.12f;
            key.intensity = 1.15f;
            key.transform.rotation = Quaternion.Euler(28, -16, 0);
            RenderSettings.reflectionIntensity = 0.65f;
            var skyShader = Shader.Find("Skybox/Procedural");
            if (skyShader != null)
            {
                atmosphereSky = new Material(skyShader) { name = "Mathscript procedural sky", hideFlags = HideFlags.HideAndDontSave };
                atmosphereSky.SetFloat("_SunDisk", 0);
                atmosphereSky.SetFloat("_AtmosphereThickness", 1.1f);
                RenderSettings.skybox = atmosphereSky;
                RenderSettings.sun = key;
            }
            var stage = new GameObject("Perspective Data Center").transform;
            stageRoot = stage;
            stage.position = new Vector3(100, 0, 0);
            BuildSurface(stage);
            BuildAtmosphere(stage);
            string[] arguments = System.Environment.GetCommandLineArgs();
            int skyIndex = System.Array.IndexOf(arguments, "-skySeconds");
            if (skyIndex >= 0 && skyIndex + 1 < arguments.Length && float.TryParse(arguments[skyIndex + 1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out float seconds) && float.IsFinite(seconds))
                fixedAtmosphere = seconds;
            Part(stage, "Bedrock", new Vector3(0,-14,2.5f), new Vector3(22,28,0.8f), new Color32(111,122,130,255));
            Part(stage, "West soil", new Vector3(-6.7f,-14,1), new Vector3(4.4f,28,2), new Color32(175,185,189,255));
            Part(stage, "East soil", new Vector3(6.2f,-14,1), new Vector3(5.2f,28,2), new Color32(175,185,189,255));
            for (int layer = 0; layer < 15; layer++)
            {
                float depth = -0.8f - layer * 1.7f;
                var west = Part(stage, "Rock outcrop", new Vector3(-5.3f,depth,-0.08f), new Vector3(0.9f,0.5f,0.35f), new Color32(177,182,176,255));
                west.localRotation = Quaternion.Euler(12, 8, -8 + layer % 4 * 4);
                var east = Part(stage, "Rock outcrop", new Vector3(4.15f,depth-0.45f,-0.08f), new Vector3(0.75f,0.62f,0.32f), new Color32(177,182,176,255));
                east.localRotation = Quaternion.Euler(-8, -12, 12 - layer % 3 * 7);
                for (int side = -1; side <= 1; side += 2)
                    Part(stage, "Rock stratum", new Vector3(side < 0 ? -6.6f : 6.3f,depth,-0.06f), new Vector3(3.5f,0.09f,0.06f), layer % 2 == 0 ? new Color32(139,153,163,255) : new Color32(201,207,207,255));
                var crystal = Part(stage, "Quartz vein", new Vector3(layer % 2 == 0 ? -5.4f : 5.2f,depth-0.5f,-0.1f), new Vector3(0.25f,0.45f,0.2f), new Color32(220,230,231,255));
                crystal.localRotation = Quaternion.Euler(0,0,25);
            }
            Part(stage, "Lift rail", new Vector3(-4,-9,0.9f), new Vector3(0.1f,21,0.1f), new Color32(169,187,189,255));
            Part(stage, "Lift rail", new Vector3(-3,-9,0.9f), new Vector3(0.1f,21,0.1f), new Color32(169,187,189,255));
            lift = new GameObject("Data cartridge lift").transform;
            lift.SetParent(stage, false);
            Part(lift, "Lift platform", new Vector3(0,-0.2f,0), new Vector3(1.1f,0.14f,1), new Color32(154,174,184,255));
            Part(lift, "Lift roof", new Vector3(0,0.75f,0), new Vector3(1.1f,0.12f,1), new Color32(154,174,184,255));
            for (int side = -1; side <= 1; side += 2)
                Part(lift, "Cage frame", new Vector3(side*0.48f,0.25f,0), new Vector3(0.08f,1,0.08f), new Color32(225,238,232,255));
            for (int rail = 0; rail < 5; rail++)
                Part(lift, "Cage frame", new Vector3(-0.42f + rail * 0.21f,0.18f,0.45f), new Vector3(0.025f,0.7f,0.025f), new Color32(193,207,207,255));
            Part(lift, "Lift cable", new Vector3(0,0.95f,0.25f), new Vector3(0.035f,0.3f,0.035f), new Color32(85,97,99,255));
            liftCargo = BuildCrate(lift, new Vector3(0,0.15f,0), new Vector3(0.65f,0.4f,0.55f), new Color32(95,142,129,255));
            compiler = Part(stage, "Compiler", new Vector3(-1.6f,0.5f,-0.5f), new Vector3(1.3f,0.8f,1.2f), new Color32(172,188,196,255));
            var compilerDetails = new GameObject("Compiler service frame").transform;
            compilerDetails.SetParent(compiler, false);
            compilerDetails.localPosition = Vector3.down * 0.4f;
            BuildMachineDetails(compilerDetails, new Vector3(1.3f,0.8f,1.2f), 0);
            Part(compiler, "Intake chute", new Vector3(-0.45f,-0.06f,-0.64f), new Vector3(0.42f,0.24f,0.22f), new Color32(106,129,127,255));
            Part(compiler, "Terminal housing", new Vector3(0.3f,0.08f,-0.65f), new Vector3(0.38f,0.26f,0.06f), new Color32(35,50,51,255));
            TechPart(compiler, "Terminal display", new Vector3(0.3f,0.08f,-0.69f), new Vector3(0.28f,0.16f,0.025f), new Color32(99,176,155,255));
            processingRotor = new GameObject("Processing spindle assembly").transform;
            processingRotor.SetParent(compiler, false);
            processingRotor.localPosition = new Vector3(0,0.5f,0);
            Part(processingRotor, "Compiler spindle", Vector3.zero, new Vector3(1.2f,0.12f,0.25f), new Color32(83,103,113,255));
            processingLight = TechPart(compiler, "Live workload indicator", new Vector3(-0.4f,0.12f,-0.69f), new Vector3(0.15f,0.08f,0.025f), ActivityColor);
            processingQueue = TechPart(compiler, "Live queue indicator", new Vector3(-0.4f,-0.05f,-0.69f), new Vector3(0.15f,0.08f,0.025f), QueueColor);
            payoutLight = TechPart(compiler, "Live payout indicator", new Vector3(0.57f,0.1f,-0.64f), new Vector3(0.06f,0.45f,0.035f), PayoutColor);
            displayedCompiled = owner.State.compiledRC;
            displayedContractIncome = owner.State.contracts.earnings;
            payoutLight.gameObject.SetActive(false);
            delivery = BuildCrate(stage, Vector3.zero, new Vector3(0.34f,0.18f,0.28f), colors[0]);
            delivery.name = "Delivery packet";
            BuildContractLogistics(stage);
            for (int floor = 0; floor < 7; floor++)
            {
                floors[floor] = new GameObject("Department " + floor).transform;
                floors[floor].SetParent(stage, false);
                floors[floor].localPosition = new Vector3(0, DeckY(floor), 0);
                Part(floors[floor], "Deck", Vector3.zero, new Vector3(7,0.22f,4), new Color32(192,205,213,255));
                Part(floors[floor], "Back wall", new Vector3(0,1.15f,1.9f), new Vector3(7,2.3f,0.12f), new Color32(220,229,232,255));
                Part(floors[floor], "Ceiling", new Vector3(0,2.5f,0), new Vector3(7,0.16f,4), new Color32(211,222,226,255));
                Part(floors[floor], "Service conduit", new Vector3(0,1.95f,1.7f), new Vector3(6.8f,0.08f,0.08f), new Color32(179,193,193,255));
                for (int lamp = 0; lamp < 3; lamp++)
                    TechPart(floors[floor], "Ceiling fixture", new Vector3(-2.2f + lamp * 2.2f,2.35f,0), new Vector3(1.3f,0.06f,0.18f), new Color32(245,241,221,255));
                Part(floors[floor], "Department light", new Vector3(0,2.2f,1.7f), new Vector3(6.7f,0.05f,0.08f), colors[floor]);
                TechPart(floors[floor], "Powered service strip", new Vector3(0,2.12f,1.6f), new Vector3(6.7f,0.035f,0.035f), colors[floor]);
                BuildInterior(floors[floor], floor);
                stock[floor] = new GameObject("Department cartridge queue").transform;
                stock[floor].SetParent(floors[floor], false);
                stock[floor].localPosition = new Vector3(-2.8f,0.15f,-0.7f);
                for (int crate = 0; crate < 6; crate++)
                    BuildCrate(stock[floor], new Vector3((crate % 2)*0.3f,(crate / 2)*0.28f,0), new Vector3(0.27f,0.25f,0.4f), colors[floor]);
                queueLights[floor] = TechPart(floors[floor], "Live queue indicator", new Vector3(-2.64f,1.05f,-0.91f), new Vector3(0.6f,0.07f,0.035f), QueueColor);
                seals[floor] = new GameObject("Sealed department portal").transform;
                seals[floor].SetParent(floors[floor], false);
                seals[floor].localPosition = new Vector3(0,1.15f,-0.4f);
                for (int side = -1; side <= 1; side += 2)
                {
                    Part(seals[floor], "Portal door", new Vector3(side * 1.7f,0,0), new Vector3(3.34f,2.15f,0.24f), new Color32(145,165,177,255));
                    Part(seals[floor], "Portal frame", new Vector3(side * 3.31f,0,-0.18f), new Vector3(0.18f,2.25f,0.18f), new Color32(74,91,102,255));
                    Part(seals[floor], "Portal interlock", new Vector3(side * 0.18f,0,-0.2f), new Vector3(0.1f,1.38f,0.07f), colors[floor]);
                    for (int vent = 0; vent < 4; vent++)
                        Part(seals[floor], "Portal ventilation slot", new Vector3(side * 1.7f,0.48f - vent * 0.3f,-0.16f), new Vector3(1.75f,0.1f,0.06f), new Color32(74,91,102,255));
                }
                Part(seals[floor], "Portal header", new Vector3(0,1.03f,-0.18f), new Vector3(6.7f,0.17f,0.18f), new Color32(74,91,102,255));
                Part(seals[floor], "Portal lock", new Vector3(0,0,-0.23f), new Vector3(0.36f,0.28f,0.06f), QueueColor);
                for (int index = 0; index < 5; index++)
                {
                    machines[floor,index] = new GameObject("Machine " + index).transform;
                    machines[floor,index].SetParent(floors[floor], false);
                    machines[floor,index].localPosition = new Vector3(-1.8f + index * 0.9f,0,0.8f);
                    var sizes = new[] { new Vector3(0.72f,1.62f,0.58f), new Vector3(0.8f,1.02f,0.72f), new Vector3(0.8f,0.8f,0.75f), new Vector3(0.78f,1.05f,0.5f), new Vector3(0.65f,1.65f,0.65f), new Vector3(0.74f,1.45f,0.65f), new Vector3(0.72f,1.7f,0.72f) };
                    var size = sizes[floor];
                    bool vessel = floor == 4 || floor == 6;
                    Part(machines[floor,index], "Module titanium chassis", new Vector3(0,size.y/2,0), vessel ? new Vector3(size.x,size.y/2,size.z) : size, new Color32(104,125,137,255), vessel ? PrimitiveType.Cylinder : PrimitiveType.Cube);
                    workloadLights[floor,index] = TechPart(machines[floor,index], "Live workload indicator", new Vector3(size.x * 0.3f,0.12f,-size.z/2-0.06f), new Vector3(0.07f,0.07f,0.03f), ActivityColor);
                    BuildMachineDetails(machines[floor,index], size, floor);
                    if (floor == 1 || floor == 4)
                    {
                        coolingFans[floor,index] = new GameObject("Cooling rotor").transform;
                        coolingFans[floor,index].SetParent(machines[floor,index], false);
                        coolingFans[floor,index].localPosition = new Vector3(0,floor == 1 ? 0.57f : 1.03f,-size.z/2-0.065f);
                        Part(coolingFans[floor,index], "Rotor blade", Vector3.zero, new Vector3(0.43f,0.07f,0.05f), new Color32(196,214,220,255));
                        Part(coolingFans[floor,index], "Rotor blade", Vector3.zero, new Vector3(0.07f,0.43f,0.05f), new Color32(196,214,220,255));
                    }
                }
                for (int member = 0; member < 4; member++)
                {
                    var worker = new GameObject("Crew " + member).transform;
                    worker.SetParent(floors[floor], false);
                    workers[floor,member] = worker;
                    crewRigs[floor,member] = worker.gameObject.AddComponent<MathscriptWorker>();
                    crewRigs[floor,member].Initialize(owner.towerShader,colors[floor],floor+member);
                    worker.localScale = Vector3.one * CrewScale;
                }
                BuildHero(floor);
            }
            if (Application.isPlaying) BatchFixedGeometry();
            Show();
            ApplyAtmosphere(fixedAtmosphere ?? 0);
        }

        private Transform TechPart(Transform parent, string title, Vector3 position, Vector3 scale, Color color)
        {
            Transform item = Part(parent, title, position, scale, color);
            Material original = item.GetComponent<Renderer>().sharedMaterial;
            if (!poweredMaterials.TryGetValue(original, out Material material))
            {
                material = new Material(original);
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", color * 0.55f);
                poweredMaterials.Add(original, material);
                techMaterials.Add(material);
            }
            item.GetComponent<Renderer>().sharedMaterial = material;
            return item;
        }

        private void BatchFixedGeometry()
        {
            var fixedParts = new List<GameObject>();
            foreach (MeshRenderer renderer in stageRoot.GetComponentsInChildren<MeshRenderer>(true))
            {
                Transform item = renderer.transform;
                if (item.IsChildOf(lift) || item.IsChildOf(compiler) || item.IsChildOf(delivery) || item.IsChildOf(sky) || item.IsChildOf(radar) || IsContractDynamicPart(item) || item.name.StartsWith("Live ") || item.name == "Rotor blade" || renderer.GetComponentInParent<MathscriptWorker>() != null) continue;
                bool treePart = false;
                foreach (Transform tree in trees) treePart |= item.IsChildOf(tree);
                if (treePart) continue;
                fixedParts.Add(renderer.gameObject);
            }
            StaticBatchingUtility.Combine(fixedParts.ToArray(),stageRoot.gameObject);
            var liftParts = new List<GameObject>();
            foreach (MeshRenderer renderer in lift.GetComponentsInChildren<MeshRenderer>()) liftParts.Add(renderer.gameObject);
            StaticBatchingUtility.Combine(liftParts.ToArray(),lift.gameObject);
            var compilerParts = new List<GameObject>();
            foreach (MeshRenderer renderer in compiler.GetComponentsInChildren<MeshRenderer>())
                if (!renderer.transform.IsChildOf(processingRotor) && !renderer.name.StartsWith("Live ")) compilerParts.Add(renderer.gameObject);
            StaticBatchingUtility.Combine(compilerParts.ToArray(), compiler.gameObject);
        }

        private Transform BuildCrate(Transform parent, Vector3 position, Vector3 size, Color color)
        {
            Transform cartridge = Part(parent, "Data cartridge housing", position, size, new Color32(179,194,199,255));
            Part(cartridge, "Cartridge identification panel", new Vector3(0,size.y * 0.15f,-size.z * 0.51f), new Vector3(size.x * 0.74f,size.y * 0.38f,0.018f), color);
            Part(cartridge, "Connector socket", new Vector3(0,-size.y * 0.24f,-size.z * 0.54f), new Vector3(size.x * 0.78f,size.y * 0.2f,0.026f), new Color32(42,52,57,255));
            for (int pin = 0; pin < 3; pin++)
                Part(cartridge, "Cartridge connector", new Vector3((pin - 1) * size.x * 0.22f,-size.y * 0.24f,-size.z * 0.59f), new Vector3(size.x * 0.1f,size.y * 0.12f,0.028f), new Color32(219,186,104,255));
            return cartridge;
        }

        private void BuildInterior(Transform floor, int department)
        {
            for (int side = -1; side <= 1; side += 2)
            {
                Part(floor, "Support beam", new Vector3(side * 3.32f,1.15f,0.65f), new Vector3(0.16f,2.3f,0.22f), new Color32(166,177,176,255));
                Part(floor, "Bolt", new Vector3(side * 3.32f,0.18f,0.49f), new Vector3(0.28f,0.12f,0.035f), new Color32(125,143,141,255));
                Part(floor, "Pipe", new Vector3(side * 3.07f,1.16f,1.56f), new Vector3(0.05f,1.08f,0.05f), new Color32(158,176,174,255), PrimitiveType.Cylinder);
            }
            for (int panel = 0; panel < 3; panel++)
                Part(floor, "Back wall", new Vector3(-2.18f + panel * 2.18f,1.05f,1.79f), new Vector3(2.13f,1.7f,0.045f), new Color32(230,237,239,255));
            Part(floor, "Support beam", new Vector3(0,2.38f,0.6f), new Vector3(6.8f,0.12f,0.22f), new Color32(137,157,158,255));
            Part(floor, "Cable tray", new Vector3(0,2.04f,1.55f), new Vector3(6.5f,0.06f,0.13f), new Color32(119,137,134,255));
            for (int cable = 0; cable < 3; cable++)
                Part(floor, "Service cable", new Vector3(0,2.08f + cable * 0.035f,1.48f), new Vector3(6.4f,0.018f,0.018f), cable == 1 ? new Color32(134,149,122,255) : new Color32(65,79,76,255));
            for (int mark = 0; mark < 18; mark++)
                Part(floor, "Deck safety edge", new Vector3(-3.25f + mark * 0.38f,0.145f,-1.92f), new Vector3(0.35f,0.06f,0.07f), mark % 2 == 0 ? new Color32(223,185,68,255) : new Color32(64,73,70,255));
            var lamp = new GameObject("Service chamber practical light").AddComponent<Light>();
            lamp.transform.SetParent(floor, false);
            lamp.transform.localPosition = new Vector3(0,1.9f,-0.3f);
            lamp.type = LightType.Point;
            lamp.color = new Color(0.93f,0.98f,1);
            lamp.intensity = 1.3f;
            lamp.range = 2.55f;
            lamp.shadows = LightShadows.None;
            lamp.renderMode = LightRenderMode.Auto;
            Part(floor, "Workbench", new Vector3(2.65f,0.62f,0.8f), new Vector3(1.1f,0.1f,0.75f), new Color32(109,135,136,255));
            for (int side = -1; side <= 1; side += 2)
                Part(floor, "Support beam", new Vector3(2.65f + side * 0.4f,0.31f,0.8f), new Vector3(0.06f,0.62f,0.55f), new Color32(140,154,153,255));
            Part(floor, "Terminal housing", new Vector3(2.65f,0.92f,0.95f), new Vector3(0.56f,0.4f,0.07f), new Color32(35,49,48,255));
            Part(floor, "Terminal stand", new Vector3(2.65f,0.76f,0.96f), new Vector3(0.08f,0.2f,0.08f), new Color32(121,138,134,255));
            TechPart(floor, "Terminal display", new Vector3(2.65f,0.92f,0.905f), new Vector3(0.46f,0.29f,0.02f), colors[department] * 0.7f);
            Part(floor, "Terminal keyboard", new Vector3(2.65f,0.685f,0.48f), new Vector3(0.4f,0.025f,0.14f), new Color32(67,85,81,255));
        }

        private void BuildMachineDetails(Transform machine, Vector3 size, int department)
        {
            float front = -size.z / 2 - 0.012f;
            for (int side = -1; side <= 1; side += 2)
            {
                Part(machine, "Support beam", new Vector3(side * size.x * 0.39f,size.y/2,front), new Vector3(0.045f,size.y * 0.92f,0.025f), new Color32(127,148,147,255));
                Part(machine, "Bolt", new Vector3(side * size.x * 0.32f,0.11f,front - 0.02f), new Vector3(0.038f,0.038f,0.02f), new Color32(198,209,207,255));
            }
            var graphite = new Color32(38,49,57,255);
            var titanium = new Color32(190,206,215,255);
            if (department == 0)
            {
                for (int blade = 0; blade < 5; blade++)
                {
                    Part(machine, "Server blade", new Vector3(0,0.35f + blade * 0.25f,front), new Vector3(size.x * 0.73f,0.18f,0.045f), graphite);
                    Part(machine, "Blade latch", new Vector3(-0.2f,0.35f + blade * 0.25f,front - 0.03f), new Vector3(0.08f,0.08f,0.035f), titanium);
                }
            }
            else if (department == 1)
            {
                Part(machine, "GPU fan recess", new Vector3(0,0.57f,front), new Vector3(0.61f,0.62f,0.04f), graphite);
                for (int fin = 0; fin < 4; fin++)
                    Part(machine, "GPU heat sink", new Vector3(-0.27f + fin * 0.18f,size.y + 0.08f,0), new Vector3(0.045f,0.16f,0.63f), titanium);
                Part(machine, "GPU accelerator board", new Vector3(0,0.2f,front - 0.025f), new Vector3(0.65f,0.08f,0.07f), colors[department]);
            }
            else if (department == 2)
            {
                for (int drawer = 0; drawer < 3; drawer++)
                {
                    Part(machine, "Storage drawer", new Vector3(0,0.24f + drawer * 0.22f,front), new Vector3(0.64f,0.18f,0.055f), titanium);
                    Part(machine, "Storage pull", new Vector3(0,0.24f + drawer * 0.22f,front - 0.05f), new Vector3(0.28f,0.04f,0.04f), graphite);
                }
            }
            else if (department == 3)
            {
                for (int row = 0; row < 3; row++)
                {
                    Part(machine, "Network switch", new Vector3(0,0.28f + row * 0.28f,front), new Vector3(0.65f,0.19f,0.06f), titanium);
                    for (int port = 0; port < 4; port++)
                        Part(machine, "Network socket", new Vector3(-0.23f + port * 0.15f,0.28f + row * 0.28f,front - 0.045f), new Vector3(0.09f,0.06f,0.025f), graphite);
                }
                Part(machine, "Patch cable riser", new Vector3(0.33f,0.8f,front - 0.06f), new Vector3(0.03f,0.68f,0.035f), colors[department]);
            }
            else if (department == 4)
            {
                Part(machine, "Cooling fan recess", new Vector3(0,1.03f,front), new Vector3(0.52f,0.52f,0.035f), graphite);
                for (int pipe = -1; pipe <= 1; pipe += 2)
                {
                    Part(machine, "Pipe", new Vector3(pipe * 0.37f,0.7f,0), new Vector3(0.045f,0.63f,0.045f), titanium, PrimitiveType.Cylinder);
                    Part(machine, "Coolant coupling", new Vector3(pipe * 0.28f,0.16f,0), new Vector3(0.22f,0.09f,0.1f), colors[department]);
                }
                Part(machine, "Cooling cap", new Vector3(0,size.y + 0.05f,0), new Vector3(0.7f,0.05f,0.7f), titanium, PrimitiveType.Cylinder);
            }
            else if (department == 5)
            {
                Part(machine, "Compute console", new Vector3(0,1.14f,front), new Vector3(0.62f,0.47f,0.05f), graphite);
                Part(machine, "Compute screen", new Vector3(0,1.14f,front - 0.03f), new Vector3(0.5f,0.34f,0.02f), colors[department]);
                for (int blade = 0; blade < 3; blade++)
                    Part(machine, "Compute processor tray", new Vector3(-0.21f + blade * 0.21f,0.48f,front), new Vector3(0.14f,0.57f,0.05f), titanium);
            }
            else
            {
                for (int ring = 0; ring < 3; ring++)
                    Part(machine, "Core memory ring", new Vector3(0,0.38f + ring * 0.49f,0), new Vector3(0.79f,0.065f,0.79f), titanium, PrimitiveType.Cylinder);
                Part(machine, "Core compute column", new Vector3(0,0.94f,front), new Vector3(0.18f,1.23f,0.055f), graphite);
                Part(machine, "Core identity rail", new Vector3(-0.23f,0.94f,front), new Vector3(0.05f,1.23f,0.035f), colors[department]);
            }
            Part(machine, "Department panel", new Vector3(0,0.11f,front - 0.012f), new Vector3(size.x * 0.45f,0.08f,0.025f), Color.Lerp(new Color32(155,174,169,255), colors[department],0.45f));
        }

        private Transform SkyPart(Transform parent, string title, Vector3 position, Vector3 scale, Color color)
        {
            Transform item = Part(parent, title, position, scale, color, PrimitiveType.Sphere);
            var material = new Material(item.GetComponent<Renderer>().sharedMaterial);
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", color);
            var renderer = item.GetComponent<Renderer>();
            renderer.sharedMaterial = material;
            renderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            renderer.receiveShadows = false;
            skyMaterials.Add(material);
            return item;
        }

        private void BuildAtmosphere(Transform stage)
        {
            sky = new GameObject("Campus atmosphere").transform;
            sky.SetParent(stage, false);
            sun = SkyPart(sky, "Sun", new Vector3(-10,10,14), Vector3.one * 2, new Color32(255,234,169,255));
            moon = SkyPart(sky, "Moon", new Vector3(10,10,14), Vector3.one * 1.4f, new Color32(211,235,243,255));
            starfield = new GameObject("Night stars").transform;
            starfield.SetParent(sky, false);
            for (int index = 0; index < 40; index++)
            {
                float horizontal = Mathf.Repeat(index * 0.6180339f, 1);
                float vertical = Mathf.Repeat(index * 0.4142135f, 1);
                SkyPart(starfield, "Star", new Vector3(-22 + horizontal * 44, 4 + vertical * 15, 25), Vector3.one * (0.065f + vertical * 0.035f), new Color32(220,238,255,255));
            }
            for (int index = 0; index < 3; index++)
            {
                var cloud = new GameObject("Drifting cloud").transform;
                cloud.SetParent(sky, false);
                cloud.localPosition = new Vector3(-16 + index * 13, 6 + index * 2, 18 + index * 2);
                clouds.Add(cloud);
                for (int puff = 0; puff < 3; puff++)
                    SkyPart(cloud, "Cloud", new Vector3((puff - 1) * 1.3f, puff == 1 ? 0.25f : 0, 0), new Vector3(2.4f,0.75f,1), new Color32(207,227,233,255));
            }
            TechPart(stage, "Campus energy conduit", new Vector3(2.7f,0.16f,-2.7f), new Vector3(6,0.045f,0.08f), Color.cyan);
            TechPart(stage, "Entrance circuit", new Vector3(-2.5f,2.2f,-1.61f), new Vector3(4.1f,0.06f,0.04f), Color.cyan);
            radar = new GameObject("Rooftop antenna").transform;
            radar.SetParent(stage, false);
            radar.localPosition = new Vector3(-4,3,0.8f);
            Part(radar, "Antenna mast", Vector3.zero, new Vector3(0.08f,0.75f,0.08f), new Color32(156,181,190,255));
            TechPart(radar, "Signal array", new Vector3(0,0.38f,0), new Vector3(1.1f,0.12f,0.12f), Color.cyan);
        }

        public void ApplyAtmosphere(float elapsedSeconds)
        {
            float phase = Mathf.Repeat(elapsedSeconds, 360) / 360;
            float altitude = Mathf.Cos(phase * Mathf.PI * 2);
            float daylight = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(-0.15f, 0.65f, altitude));
            float dusk = (1 - Mathf.SmoothStep(0, 1, Mathf.InverseLerp(0, 0.65f, Mathf.Abs(altitude)))) * (1 - daylight);
            Color skyColor = Color.Lerp(new Color32(18,28,53,255), new Color32(154,208,232,255), daylight);
            skyColor = Color.Lerp(skyColor, new Color32(219,148,143,255), dusk);
            sceneCamera.backgroundColor = skyColor;
            if (atmosphereSky != null)
            {
                Color skyTint = Color.Lerp(new Color32(77, 111, 151, 255), new Color32(142, 200, 238, 255), daylight);
                skyTint = Color.Lerp(skyTint, new Color32(237, 174, 158, 255), dusk);
                Color groundTint = Color.Lerp(new Color32(31, 43, 60, 255), new Color32(148, 168, 168, 255), daylight);
                groundTint = Color.Lerp(groundTint, new Color32(170, 119, 109, 255), dusk);
                atmosphereSky.SetColor("_SkyTint", skyTint);
                atmosphereSky.SetColor("_GroundColor", groundTint);
                atmosphereSky.SetFloat("_AtmosphereThickness", Mathf.Lerp(0.55f, 0.78f, daylight));
                atmosphereSky.SetFloat("_Exposure", Mathf.Lerp(0.58f, 0.9f, daylight));
            }
            float illumination = Mathf.Max(0.55f, daylight);
            sunlight.intensity = Mathf.Lerp(0.65f, 1.3f, illumination);
            sunlight.color = Color.Lerp(new Color32(163,197,227,255), new Color32(247,250,255,255), illumination);
            RenderSettings.ambientSkyColor = Color.Lerp(new Color(0.3f,0.36f,0.46f), new Color(0.62f,0.68f,0.74f), illumination);
            RenderSettings.ambientEquatorColor = Color.Lerp(new Color(0.25f,0.3f,0.36f), new Color(0.36f,0.4f,0.43f), illumination);
            RenderSettings.ambientGroundColor = new Color(0.2f,0.22f,0.24f);
            sky.gameObject.SetActive(true);
            sun.localPosition = new Vector3(-Mathf.Sin(phase * Mathf.PI * 2) * 18, altitude * 11 + 3, 20);
            moon.localPosition = new Vector3(Mathf.Sin(phase * Mathf.PI * 2) * 18, -altitude * 11 + 3, 20);
            sunlight.transform.rotation = Quaternion.Euler(28,-16,0);
            sun.gameObject.SetActive(altitude > -0.1f);
            moon.gameObject.SetActive(altitude < 0.1f);
            starfield.gameObject.SetActive(daylight < 0.15f);
            foreach (Transform star in starfield)
                star.localScale = Vector3.one * (0.065f + 0.015f * Mathf.Sin(elapsedSeconds * 1.5f + star.GetSiblingIndex()));
            for (int index = 0; index < clouds.Count; index++)
            {
                Transform cloud = clouds[index];
                cloud.localPosition = new Vector3(-23 + Mathf.Repeat(elapsedSeconds * 0.035f + index * 13, 46), 6 + index * 2, 18 + index * 2);
                foreach (Transform puff in cloud)
                {
                    var material = puff.GetComponent<Renderer>().sharedMaterial;
                    material.color = Color.Lerp(new Color32(67,83,108,255), new Color32(220,238,242,255), daylight);
                    material.SetColor("_EmissionColor", material.color * 0.35f);
                }
            }
            radar.localRotation = Quaternion.Euler(0, elapsedSeconds * 24, 0);
            foreach (var material in techMaterials)
                material.SetColor("_EmissionColor", material.color * Mathf.Lerp(1.4f,0.4f,daylight));
            bool surface = owner.State.viewport == 0;
            sky.gameObject.SetActive(surface);
            sceneCamera.clearFlags = surface && atmosphereSky != null ? CameraClearFlags.Skybox : CameraClearFlags.SolidColor;
            if (!surface)
            {
                sceneCamera.backgroundColor = new Color32(80,87,83,255);
                sunlight.intensity = 1.12f;
                sunlight.color = new Color32(232,240,245,255);
                RenderSettings.ambientSkyColor = new Color(0.56f,0.62f,0.66f);
                RenderSettings.ambientEquatorColor = new Color(0.4f,0.44f,0.45f);
            }
        }

        private Transform Part(Transform parent, string title, Vector3 position, Vector3 scale, Color color, PrimitiveType shape = PrimitiveType.Cube)
        {
            var item = GameObject.CreatePrimitive(shape);
            item.name = title;
            item.transform.SetParent(parent, false);
            item.transform.localPosition = position;
            if (shape == PrimitiveType.Cube)
            {
                bool rock = title == "Rock outcrop";
                item.GetComponent<MeshFilter>().sharedMesh = rock ? surfaces.GetRock(parent.childCount) : surfaces.GetBox(scale);
                item.transform.localScale = rock ? scale : Vector3.one;
            }
            else item.transform.localScale = scale;
            bool titanium = title == "Data cartridge housing" || title == "Cartridge connector" || title == "Module titanium chassis";
            item.GetComponent<Renderer>().sharedMaterial = surfaces.GetMaterial(titanium ? MathscriptSurfaces.Surface.Steel : MathscriptSurfaces.Identify(title), color);
            if (Application.isPlaying) Destroy(item.GetComponent<Collider>());
            else DestroyImmediate(item.GetComponent<Collider>());
            return item.transform;
        }

        private void BuildSurface(Transform stage)
        {
            Part(stage, "Open land", new Vector3(0,0,0), new Vector3(18,0.18f,7), new Color32(76,103,61,255));
            for (int ledge = 0; ledge < 17; ledge++)
            {
                float horizontal = -8.4f + ledge * 1.05f + Mathf.Sin(ledge * 2.3f) * 0.16f;
                float height = -0.13f + Mathf.Sin(ledge * 1.8f) * 0.06f;
                Vector3 size = new Vector3(0.72f + ledge % 3 * 0.22f,0.22f + ledge % 4 * 0.055f,0.32f + ledge % 3 * 0.05f);
                var edge = Part(stage, "Rock outcrop", new Vector3(horizontal,height,-3.35f), size, new Color32(143,151,119,255));
                edge.localRotation = Quaternion.Euler(ledge % 3 * 8, ledge * 37, -6 + ledge % 4 * 4);
            }
            Part(stage, "Access path", new Vector3(-2.5f,0.11f,-2.3f), new Vector3(5,0.05f,1.2f), new Color32(192,204,197,255));
            for (int joint = 0; joint < 7; joint++)
                Part(stage, "Path joint", new Vector3(-4.6f + joint * 0.7f,0.14f,-2.3f), new Vector3(0.018f,0.012f,1.15f), new Color32(127,143,130,255));
            var house = new GameObject("Surface headhouse").transform;
            house.SetParent(stage, false);
            house.localPosition = new Vector3(-2.5f,0.1f,0);
            Part(house, "Rear facade", new Vector3(0,1.2f,1.45f), new Vector3(4.4f,2.4f,0.18f), new Color32(215,228,223,255));
            Part(house, "West facade", new Vector3(-2.15f,1.2f,0), new Vector3(0.18f,2.4f,3), new Color32(215,228,223,255));
            Part(house, "East facade", new Vector3(2.15f,1.2f,0), new Vector3(0.18f,2.4f,3), new Color32(215,228,223,255));
            Part(house, "Roof", new Vector3(0,2.45f,0), new Vector3(4.8f,0.25f,3.4f), new Color32(48,76,81,255));
            Part(house, "Entrance lintel", new Vector3(0,2.05f,-1.5f), new Vector3(4.3f,0.35f,0.15f), new Color32(43,157,171,255));
            for (int side = -1; side <= 1; side += 2)
            {
                Part(house, "Support beam", new Vector3(side * 2.05f,1.1f,-1.52f), new Vector3(0.12f,2.15f,0.16f), new Color32(127,147,141,255));
                Part(house, "Pipe", new Vector3(side * 2.26f,1.18f,-1.15f), new Vector3(0.035f,1.14f,0.035f), new Color32(119,139,134,255), PrimitiveType.Cylinder);
                TechPart(house, "Entrance light", new Vector3(side * 1.82f,1.9f,-1.62f), new Vector3(0.14f,0.22f,0.045f), new Color32(221,225,190,255));
            }
            Part(house, "Equipment cabinet", new Vector3(1.3f,0.61f,1.1f), new Vector3(0.72f,1.14f,0.42f), new Color32(120,141,131,255));
            for (int panel = 0; panel < 3; panel++)
            {
                var solar = Part(house, "Solar panel", new Vector3(-1.4f + panel * 1.4f,2.62f,0.2f), new Vector3(1.15f,0.06f,2), new Color32(46,74,88,255));
                for (int cell = 0; cell < 6; cell++)
                    Part(solar, "Solar grid", new Vector3(-0.45f + cell * 0.18f,0.045f,0), new Vector3(0.012f,0.012f,1.82f), new Color32(154,174,180,255));
            }
            Part(house, "Roof flashing", new Vector3(0,2.47f,-1.73f), new Vector3(4.86f,0.09f,0.045f), new Color32(183,199,195,255));
            for (int tree = 0; tree < 5; tree++)
            {
                float position = tree < 2 ? -7 + tree * 1.5f : 4 + (tree - 2) * 1.5f;
                var treeRoot = new GameObject("Surface tree " + tree).transform;
                treeRoot.SetParent(stage,false);
                treeRoot.localPosition = new Vector3(position,0,1.5f);
                trees.Add(treeRoot);
                treeYaw.Add(tree * 37);
                Part(treeRoot, "Tree trunk", new Vector3(0,0.65f,0), new Vector3(0.14f,0.65f,0.14f), new Color32(195,186,162,255), PrimitiveType.Cylinder);
                var canopy = Part(treeRoot, "Tree canopy", new Vector3(0,0.55f,0), Vector3.one * (1.05f + tree % 3 * 0.12f), new Color32(116,146,103,255), PrimitiveType.Sphere);
                canopy.GetComponent<MeshFilter>().sharedMesh = surfaces.GetFoliage(tree);
                for (int branch = 0; branch < 3; branch++)
                {
                    var limb = Part(treeRoot, "Tree branch", new Vector3(0,0.75f + branch * 0.25f,0), new Vector3(0.055f,0.23f,0.055f), new Color32(195,186,162,255), PrimitiveType.Cylinder);
                    limb.localRotation = Quaternion.Euler(25, branch * 117, 58);
                }
            }
        }

        public void Show()
        {
            visible = true;
            clearCamera.enabled = true;
            sceneCamera.enabled = true;
            sceneCamera.orthographic = true;
            FrameCamera();
        }

        internal void AssertDepartment(int floor)
        {
            if (stock[floor].childCount != 6 || stock[floor].GetChild(0).Find("Cartridge connector") == null || delivery.Find("Connector socket") == null)
                throw new System.InvalidOperationException("Data cargo is missing its cartridge connectors");
            if (seals[floor].Find("Portal lock") == null || seals[floor].gameObject.activeSelf != (owner.State.levels[floor] == 0))
                throw new System.InvalidOperationException("Department portal does not follow the unlock state");
            string[] silhouettes = { "Server blade", "GPU heat sink", "Storage drawer", "Network socket", "Cooling cap", "Compute console", "Core memory ring" };
            if (machines[floor,0].Find(silhouettes[floor]) == null || machines[floor,0].GetComponentsInChildren<MeshFilter>(true).Length > 26)
                throw new System.InvalidOperationException("Department equipment silhouette or mesh budget mismatch");
            if (queueLights[floor].gameObject.activeSelf != (owner.State.levels[floor] > 0 && owner.State.bins[floor] > 0))
                throw new System.InvalidOperationException("Queue indicator does not follow real department stock");
            int crew = owner.State.levels[floor] == 0 ? 0 : MathscriptTycoonUI.WorkerCount(owner.State.levels[floor]);
            for (int member = 0; member < 4; member++)
            {
                if (workers[floor, member].gameObject.activeSelf != (member < crew))
                    throw new System.InvalidOperationException("3D crew count mismatch");
                if (member >= crew) continue;
                Vector3 position = workers[floor, member].localPosition;
                if (position.x < -3.5f || position.x > 3.5f || position.z < -2 || position.z > 2)
                    throw new System.InvalidOperationException("3D crew escaped department");
            }
            for (int machine = 0; machine < 5; machine++)
            {
                if (machines[floor, machine].gameObject.activeSelf != (crew > 0 && machine < crew + 1))
                    throw new System.InvalidOperationException("3D equipment evolution mismatch");
                if (workloadLights[floor,machine].gameObject.activeSelf != (owner.State.hired[floor] || owner.WorkElapsed(floor) < 2))
                    throw new System.InvalidOperationException("Workload indicator does not follow managed or manual work");
            }
        }

        private void Update()
        {
            if (!visible) return;
            FrameCamera();
            atmosphereElapsed += Time.unscaledDeltaTime;
            ApplyAtmosphere(fixedAtmosphere ?? atmosphereElapsed);
            for (int tree = 0; tree < trees.Count; tree++)
                trees[tree].localRotation = Quaternion.Euler(Mathf.Sin(atmosphereElapsed * 0.7f + tree) * 0.8f, treeYaw[tree], Mathf.Sin(atmosphereElapsed * 0.55f + tree * 1.4f) * 1.1f);
            var state = owner.State;
            float movementBlend = Application.isPlaying ? 1 - Mathf.Exp(-Time.deltaTime * 12) : 1;
            float poseBlend = Application.isPlaying ? 1 - Mathf.Exp(-Time.deltaTime * 16) : 1;
            for (int floor = 0; floor < 7; floor++)
            {
                bool inView = floor >= state.viewport && floor < state.viewport + VisibleFloorCount;
                floors[floor].gameObject.SetActive(inView);
                UpdateHero(floor,poseBlend);
                if (!inView) continue;
                seals[floor].gameObject.SetActive(state.levels[floor] == 0);
                stock[floor].gameObject.SetActive(state.bins[floor] > 0);
                queueLights[floor].gameObject.SetActive(state.levels[floor] > 0 && state.bins[floor] > 0);
                for (int crate = 0; crate < stock[floor].childCount; crate++)
                    stock[floor].GetChild(crate).gameObject.SetActive(crate < Mathf.Clamp(Mathf.CeilToInt((float)(state.bins[floor] / 5)),1,6));
                int crew = state.levels[floor] == 0 ? 0 : MathscriptTycoonUI.WorkerCount(state.levels[floor]);
                for (int index = 0; index < 5; index++)
                {
                    machines[floor,index].gameObject.SetActive(index < crew+1 && crew > 0);
                    workloadLights[floor,index].gameObject.SetActive(state.hired[floor] || owner.WorkElapsed(floor) < 2);
                    if (coolingFans[floor,index] != null && machines[floor,index].gameObject.activeInHierarchy && (state.hired[floor] || owner.WorkElapsed(floor) < 2))
                        coolingFans[floor,index].Rotate(0,0,Time.deltaTime * 300);
                }
                for (int member = 0; member < 4; member++)
                {
                    workers[floor,member].gameObject.SetActive(member < crew);
                    bool active = state.hired[floor];
                    float phase = Mathf.Repeat(Time.time + member*2.5f,12);
                    bool carrying = active && phase >= 7 && phase < 11;
                    bool walking = active && phase < 4;
                    float position = walking ? Mathf.Lerp(-1.8f,1.4f,phase/4) : carrying ? Mathf.Lerp(1.4f,-1.8f,(phase-7)/4) : phase >= 11 ? -1.8f : 1.4f;
                    Vector3 desiredPosition = new Vector3(active ? position + member * 0.35f : member*0.65f,0.09f,-0.8f-member*0.2f);
                    Quaternion desiredRotation = Quaternion.Euler(0,walking ? -90 : carrying ? 90 : 0,0);
                    var motion = !active || phase >= 11 ? MathscriptWorker.Motion.Idle : walking ? MathscriptWorker.Motion.Walk : carrying ? MathscriptWorker.Motion.Carry : MathscriptWorker.Motion.Work;
                    float elapsed = owner.WorkElapsed(floor);
                    if (elapsed < 2.4f)
                    {
                        float travel = Mathf.Clamp01((elapsed - 0.7f) / 1.1f);
                        desiredPosition = new Vector3(Mathf.Lerp(1.4f, -1.8f, travel) + member * 0.3f, 0.09f, -0.8f - member * 0.2f);
                        desiredRotation = Quaternion.Euler(0, elapsed < 0.7f ? 0 : 90, 0);
                        motion = elapsed < 0.7f ? MathscriptWorker.Motion.Work : elapsed < 1.8f ? MathscriptWorker.Motion.Carry : MathscriptWorker.Motion.Walk;
                    }
                    workers[floor,member].localPosition = Vector3.Lerp(workers[floor,member].localPosition, desiredPosition, movementBlend);
                    workers[floor,member].localRotation = Quaternion.Slerp(workers[floor,member].localRotation, desiredRotation, movementBlend);
                    crewRigs[floor,member].Pose(motion,Time.time+member,poseBlend);
                    float sideFacing = Mathf.Abs(Mathf.Sin(workers[floor,member].localEulerAngles.y*Mathf.Deg2Rad));
                    float correctedWidth = CrewScale / stageRoot.localScale.x;
                    workers[floor,member].localScale = new Vector3(Mathf.Lerp(correctedWidth,CrewScale,sideFacing),CrewScale,Mathf.Lerp(CrewScale,correctedWidth,sideFacing));
                }
            }
            float height = SlotY(state.routeViewport, state.currentSlot);
            if (state.busState == "MOVING_UP" || state.busState == "MOVING_DOWN") height = Mathf.Lerp(SlotY(state.routeViewport,state.fromSlot),SlotY(state.routeViewport,state.targetSlot),TravelProgress((float)state.busRemaining,(float)state.moveDuration));
            lift.localPosition = new Vector3(-3.5f,height,0);
            liftCargo.gameObject.SetActive(state.busPayload > 0);
            bool processing = state.compilerState == "PROCESSING";
            if (processing) processingRotor.Rotate(0,Time.deltaTime * 240,0);
            processingLight.gameObject.SetActive(processing);
            processingQueue.gameObject.SetActive(state.compilerBuffer > 0);
            if (state.compiledRC > displayedCompiled && !state.HasCompanyContract || state.contracts.earnings > displayedContractIncome) payoutRemaining = 1.2f;
            displayedCompiled = state.compiledRC;
            displayedContractIncome = state.contracts.earnings;
            payoutRemaining = Mathf.Max(0,payoutRemaining - Time.unscaledDeltaTime);
            payoutLight.gameObject.SetActive(payoutRemaining > 0);
            bool loading = state.busState == "LOADING";
            bool unloading = state.busState == "UNLOADING";
            delivery.gameObject.SetActive(loading || unloading);
            if (loading) delivery.localPosition = Vector3.Lerp(new Vector3(-2.8f,height,-0.7f),lift.localPosition,Mathf.Repeat((1-(float)(state.busRemaining/state.tripLoad))*3,1));
            if (unloading) delivery.localPosition = Vector3.Lerp(lift.localPosition,compiler.localPosition,1-(float)(state.busRemaining/0.4));
            UpdateContractLogistics(state);
        }

        public static float TravelProgress(float remaining, float duration) => duration <= 0 ? 1 : Mathf.SmoothStep(0, 1, Mathf.Clamp01(1 - remaining / duration));

        private void FrameCamera()
        {
            FrameViewport(Screen.width, Screen.height);
        }

        private void FrameViewport(int width, int height)
        {
            if (owner.State == null) return;
            if (framedWidth == width && framedHeight == height && framedViewport == owner.State.viewport && framedRect == logicalFrame) return;
            framedWidth = width;
            framedHeight = height;
            framedViewport = owner.State.viewport;
            framedRect = logicalFrame;
            Rect frame = MathscriptTycoonUI.LogicalToScreen(logicalFrame, width, height);
            sceneCamera.rect = new Rect(frame.x / width, 1 - frame.yMax / height, frame.width / width, frame.height / height);
            stageRoot.localScale = Vector3.one;
            foreach (Transform tree in trees) tree.localScale = Vector3.one;
            contractTruck.localScale = Vector3.one;
            QualitySettings.shadowResolution = ShadowResolution.High;
            sceneCamera.clearFlags = owner.State.viewport == 0 && atmosphereSky != null ? CameraClearFlags.Skybox : CameraClearFlags.SolidColor;
            float top = owner.State.viewport == 0 ? 3.4f : DeckY(owner.State.viewport) + FloorPitch - 0.1f;
            float bottom = DeckY(Mathf.Min(6,owner.State.viewport + VisibleFloorCount - 1)) - 0.35f;
            float center = (top + bottom) * 0.5f;
            sceneCamera.orthographic = true;
            var target = new Vector3(100, center, 0);
            sceneCamera.transform.position = target + new Vector3(1.25f,1.3f,-24);
            sceneCamera.transform.LookAt(target);
            float aspect = logicalFrame.width / logicalFrame.height;
            sceneCamera.aspect = aspect;
            float fit = 0;
            foreach (float horizontal in new[] { -4.65f,3.75f })
                foreach (float vertical in new[] { bottom,top })
                    foreach (float depth in new[] { -2.2f,2.2f })
                    {
                        Vector3 corner = sceneCamera.transform.InverseTransformPoint(stageRoot.TransformPoint(new Vector3(horizontal,vertical,depth)));
                        fit = Mathf.Max(fit,Mathf.Abs(corner.y),Mathf.Abs(corner.x)/aspect);
                    }
            sceneCamera.orthographicSize = fit*1.045f;
        }

        private void OnDestroy()
        {
            if (RenderSettings.skybox == atmosphereSky) RenderSettings.skybox = previousSkybox;
            if (RenderSettings.sun == sunlight) RenderSettings.sun = previousSun;
            surfaces?.Dispose();
            foreach (var material in skyMaterials) DisposeMaterial(material);
            foreach (var material in techMaterials) DisposeMaterial(material);
            if (atmosphereSky != null) DisposeMaterial(atmosphereSky);
        }

        private static void DisposeMaterial(Material material)
        {
            if (Application.isPlaying) Destroy(material);
            else DestroyImmediate(material);
        }
    }
}