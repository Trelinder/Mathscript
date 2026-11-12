using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace MathscriptPrototype
{
    public sealed class TycoonPrototype : MonoBehaviour
    {
        public Shader factoryShader;
        private TycoonCore state = new TycoonCore();
        private readonly Transform[] parcels = new Transform[20];
        private Transform rotor;
        private string answer = "";
        private string status = "Factory online";
        private float saveTimer;
        private GUIStyle titleStyle;
        private GUIStyle bodyStyle;
        private GUIStyle numberStyle;
        private GUIStyle buttonStyle;
        private GUIStyle inputStyle;
        private bool smoke;
        private string SavePath => Path.Combine(Application.persistentDataPath, "prototype-v1.json");

        private void Start()
        {
            smoke = Array.IndexOf(Environment.GetCommandLineArgs(), "-prototypeSmoke") >= 0;
            if (!smoke) Load();
            CreateFactory();
            if (smoke) StartCoroutine(Smoke());
        }

        private void Update()
        {
            state.Tick(Time.deltaTime);
            rotor.Rotate(0, 55 * Time.deltaTime, 0);
            for (int index = 0; index < parcels.Length; index++)
            {
                parcels[index].gameObject.SetActive(index < state.stock);
                parcels[index].localRotation = Quaternion.Euler(0, Mathf.Sin(Time.time + index) * 5, 0);
            }
            saveTimer += Time.deltaTime;
            if (saveTimer >= 5 && !smoke)
            {
                Save();
                saveTimer = 0;
            }
        }

        private void CreateFactory()
        {
            var cameraObject = new GameObject("Factory Camera");
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.07f, 0.11f, 0.12f);
            camera.orthographic = true;
            camera.orthographicSize = 7;
            camera.transform.position = new Vector3(12, 12, -15);
            camera.transform.LookAt(new Vector3(2.5f, 0, 0));
            var light = new GameObject("Factory Sun").AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.3f;
            light.transform.rotation = Quaternion.Euler(45, -30, 0);
            RenderSettings.ambientLight = new Color(0.55f, 0.65f, 0.65f);
            Box("Foundation", new Vector3(-2, -0.3f, 0), new Vector3(9, 0.5f, 8), new Color(0.18f, 0.24f, 0.25f));
            Box("Conveyor", new Vector3(-2, 0.15f, -1), new Vector3(7, 0.3f, 1.4f), new Color(0.08f, 0.1f, 0.11f));
            Box("Production Unit", new Vector3(-4.5f, 1, 1.5f), new Vector3(2, 2, 2), new Color(0.12f, 0.64f, 0.55f));
            Box("Output Chute", new Vector3(-4.5f, 0.6f, -0.2f), new Vector3(1, 0.5f, 1.6f), new Color(0.7f, 0.78f, 0.8f));
            rotor = Box("Turbine", new Vector3(-4.5f, 2.3f, 1.5f), new Vector3(2.6f, 0.2f, 0.4f), new Color(1, 0.76f, 0.24f));
            Box("Dispatch", new Vector3(0.5f, 0.7f, 1.5f), new Vector3(1.6f, 1.4f, 2), new Color(0.9f, 0.33f, 0.27f));
            for (int index = 0; index < parcels.Length; index++)
            {
                parcels[index] = Box("Stock " + index,
                    new Vector3(-3 + index % 5 * 0.8f, 0.65f + index / 10 * 0.6f, -2.2f - index / 5 % 2 * 0.8f),
                    Vector3.one * 0.55f, new Color(1, 0.76f, 0.24f));
            }
        }

        private Transform Box(string objectName, Vector3 position, Vector3 scale, Color color)
        {
            if (factoryShader == null) throw new InvalidOperationException("Factory shader reference is missing");
            var item = GameObject.CreatePrimitive(PrimitiveType.Cube);
            item.name = objectName;
            item.transform.position = position;
            item.transform.localScale = scale;
            var material = new Material(factoryShader);
            material.color = color;
            item.GetComponent<Renderer>().material = material;
            return item.transform;
        }

        private void OnGUI()
        {
            if (titleStyle == null)
            {
                titleStyle = new GUIStyle(GUI.skin.label) { fontSize = 28, fontStyle = FontStyle.Bold };
                bodyStyle = new GUIStyle(GUI.skin.label) { fontSize = 18, wordWrap = true };
                numberStyle = new GUIStyle(GUI.skin.label) { fontSize = 42, fontStyle = FontStyle.Bold };
                buttonStyle = new GUIStyle(GUI.skin.button) { fontSize = 18 };
                inputStyle = new GUIStyle(GUI.skin.textField) { fontSize = 24 };
            }
            float scale = Mathf.Min(Screen.width / 1100f, Screen.height / 700f);
            GUI.matrix = Matrix4x4.TRS(new Vector3((Screen.width - 1100 * scale) / 2, (Screen.height - 700 * scale) / 2), Quaternion.identity, Vector3.one * scale);
            GUI.Label(new Rect(32, 25, 650, 40), "MATHSCRIPT / FACTORY", titleStyle);
            GUI.Label(new Rect(32, 70, 600, 30), "UNITY PROTOTYPE", bodyStyle);
            GUI.Box(new Rect(720, 20, 355, 660), GUIContent.none);
            GUI.Label(new Rect(745, 40, 300, 35), "WORKSHOP " + state.level, titleStyle);
            GUI.Label(new Rect(745, 90, 300, 30), "COINS", bodyStyle);
            GUI.Label(new Rect(745, 120, 300, 60), state.coins.ToString(), numberStyle);
            GUI.Label(new Rect(745, 190, 300, 35), "Stock  " + state.stock + " / " + state.Capacity, bodyStyle);
            GUI.Label(new Rect(745, 225, 300, 35), state.level + " items / 2 seconds", bodyStyle);
            GUI.enabled = state.stock > 0 && state.pendingUnits == 0;
            if (GUI.Button(new Rect(745, 270, 305, 45), "Dispatch stock", buttonStyle))
            {
                state.BeginSale();
                answer = "";
                status = "Order ready";
                Save();
            }
            GUI.enabled = true;
            if (state.pendingUnits > 0)
            {
                GUI.Label(new Rect(745, 330, 305, 60), state.pendingUnits + " items at " + state.pendingPrice + " coins each. Total?", bodyStyle);
                GUI.SetNextControlName("SaleAnswer");
                answer = GUI.TextField(new Rect(745, 400, 305, 40), answer, 8, inputStyle);
                bool enter = Event.current.type == EventType.KeyDown && Event.current.keyCode == KeyCode.Return && GUI.GetNameOfFocusedControl() == "SaleAnswer";
                if (GUI.Button(new Rect(745, 455, 305, 45), "Complete sale", buttonStyle) || enter)
                {
                    if (enter) Event.current.Use();
                    status = int.TryParse(answer, out int value) && state.Answer(value) ? "Sale complete" : "Not quite. Try again.";
                    Save();
                }
            }
            GUI.enabled = state.coins >= state.UpgradeCost && state.level < 10;
            if (GUI.Button(new Rect(745, 530, 305, 45), state.level == 10 ? "Workshop fully upgraded" : "Upgrade / " + state.UpgradeCost + " coins", buttonStyle))
            {
                state.Upgrade();
                status = "Production upgraded";
                Save();
            }
            GUI.enabled = true;
            GUI.Label(new Rect(745, 600, 305, 60), status, bodyStyle);
        }

        private void Load()
        {
            if (!File.Exists(SavePath)) return;
            try
            {
                var loaded = JsonUtility.FromJson<TycoonCore>(File.ReadAllText(SavePath));
                if (loaded == null || !loaded.IsValid()) throw new InvalidDataException("Invalid prototype save");
                state = loaded;
                status = "Workshop restored";
            }
            catch (Exception exception)
            {
                status = "Save unavailable; new workshop";
                Debug.LogWarning(exception.Message);
            }
        }

        private void Save()
        {
            if (smoke) return;
            try
            {
                Directory.CreateDirectory(Application.persistentDataPath);
                File.WriteAllText(SavePath + ".tmp", JsonUtility.ToJson(state));
                if (File.Exists(SavePath)) File.Replace(SavePath + ".tmp", SavePath, null);
                else File.Move(SavePath + ".tmp", SavePath);
            }
            catch (Exception exception)
            {
                status = "Local save failed";
                Debug.LogWarning(exception.Message);
            }
        }

        private void OnApplicationQuit() => Save();
        private void OnApplicationPause(bool paused) { if (paused) Save(); }

        private IEnumerator Smoke()
        {
            state.stock = 5;
            yield return new WaitForSeconds(2);
            if (!state.BeginSale() || !state.Answer(state.ExpectedAnswer) || !state.Upgrade())
            {
                Debug.LogError("MATHSCRIPT_RUNTIME_SMOKE_FAILED");
                Application.Quit(1);
                yield break;
            }
            state.stock = 12;
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(Path.Combine(Application.temporaryCachePath, "mathscript-prototype.png"));
            yield return new WaitForSeconds(1);
            Debug.Log("MATHSCRIPT_RUNTIME_SMOKE_PASS screenshot=" + Path.Combine(Application.temporaryCachePath, "mathscript-prototype.png"));
            Application.Quit(0);
        }
    }
}