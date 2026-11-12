using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace MathscriptPrototype
{
    public sealed partial class MathscriptTycoonUI : MonoBehaviour
    {
        private MathscriptIdleMiner game;
        private MathscriptEconomy State => game.State;
        private VisualElement root;
        private VisualElement overlay;
        private VisualElement dialog;
        private ScrollView dialogScroll;
        private Label coins;
        private Label income;
        private Label bins;
        private Label payload;
        private Label buffer;
        private Label production;
        private Label busMetric;
        private Label compilerMetric;
        private Label productionDetail;
        private Label busDetail;
        private Label compilerDetail;
        private Label liftCargo;
        private VisualElement liftLoad;
        private Label flow;
        private Label objectiveLabel;
        private Label objectiveHeading;
        private VisualElement objectiveProgress;
        private Label recommendation;
        private Button invest;
        private Label busPhase;
        private Label compilerPhase;
        private Label status;
        private Label floorRange;
        private Button up;
        private Button down;
        private Button send;
        private Button compile;
        private Button compilerOptions;
        private readonly VisualElement[] landings = new VisualElement[7];
        private readonly List<Action> refreshers = new List<Action>();
        private readonly List<Action> dialogRefreshers = new List<Action>();
        private readonly float[] workStarted = { -100, -100, -100, -100, -100, -100, -100 };
        private VisualElement compilerMachine;
        private VisualElement compilerWheel;
        private VisualElement compilerProgress;
        private Label compilerOutput;
        private readonly List<VisualElement> computeBars = new List<VisualElement>();
        private readonly List<Label> readouts = new List<Label>();
        private double lastCompiled;
        private float payoutAt = -100;
        private VisualElement returnFocus;
        private int shownViewport = -1;
        private int shownRooms = -1;
        private int shownEvolution = -1;
        private int shownChallenge = -1;
        private int bulk = 1;
        private bool challengeDialog;
        private PanelSettings panel;
        private int shownFloorCount;
        public const int LogicalWidth = 1280;
        public const int LogicalHeight = 720;
        private const int LogicalWorldTop = 68 + 72 + 100;
        private const int PortraitWidth = 480;
        private const int PortraitWorldTop = 72 + 74 + 178;
        private Rect LogicalWorldBounds => WorldBounds(Screen.width, Screen.height);
        private int layoutWidth = -1;
        private int layoutHeight = -1;
        private int VisibleFloorCount => IsPortraitViewport(layoutWidth, layoutHeight) || IsCompactLandscape(layoutWidth, layoutHeight) ? 1 : 3;
        internal bool Is3DOnly => root.ClassListContains("perspective") && root.Query<Button>().ToList().TrueForAll(control => control.text != "VIEW");

        public static bool IsPortraitViewport(int width, int height) => height > width;
        public static bool IsCompactLandscape(int width, int height) => width >= height && height > 0 && height < 720;

        public static Vector2 LogicalSize(int width, int height) => IsPortraitViewport(width, height)
            ? new Vector2(PortraitWidth, PortraitWidth * Mathf.Max(1, height) / (float)Mathf.Max(1, width))
            : IsCompactLandscape(width, height) ? new Vector2(960, 960 * height / (float)Mathf.Max(1, width)) : new Vector2(LogicalWidth, LogicalHeight);

        public static Rect WorldBounds(int width, int height) => IsPortraitViewport(width, height)
            ? new Rect(0, PortraitWorldTop + 72, PortraitWidth, LogicalSize(width, height).y - PortraitWorldTop - 72 - 216)
            : IsCompactLandscape(width, height) ? new Rect(0, 268, 700, LogicalSize(width, height).y - 268)
            : new Rect(0, LogicalWorldTop, LogicalWidth - 260, LogicalHeight - LogicalWorldTop);

        public static float ViewportScale(int width, int height)
        {
            Vector2 size = LogicalSize(width, height);
            return Mathf.Min(Mathf.Max(1, width) / size.x, Mathf.Max(1, height) / size.y);
        }

        public static Rect ContentBounds(int width, int height)
        {
            float scale = ViewportScale(width, height);
            Vector2 size = LogicalSize(width, height) * scale;
            return new Rect((width - size.x) / 2, (height - size.y) / 2, size.x, size.y);
        }

        public static Rect LogicalToScreen(Rect bounds, int width, int height)
        {
            float scale = ViewportScale(width, height);
            Rect content = ContentBounds(width, height);
            return new Rect(content.position + bounds.position * scale, bounds.size * scale);
        }

        public static Vector2 ScreenToLogical(Vector2 position, int width, int height) => (position - ContentBounds(width, height).position) / ViewportScale(width, height);

        private Rect ScreenBounds(VisualElement element) => element.worldBound;

        private void ConfigureViewport()
        {
            ApplyViewport(Screen.width, Screen.height);
        }

        private void ApplyViewport(int width, int height)
        {
            if (layoutWidth == width && layoutHeight == height) return;
            layoutWidth = width;
            layoutHeight = height;
            bool portrait = IsPortraitViewport(width, height);
            bool compact = IsCompactLandscape(width, height);
            Vector2 size = LogicalSize(width, height);
            root.EnableInClassList("portrait-screen", portrait);
            root.EnableInClassList("compact-screen", compact);
            root.style.width = size.x;
            root.style.height = size.y;
            shownViewport = -1;
            float scale = ViewportScale(layoutWidth, layoutHeight);
            panel.scale = 1;
            root.style.scale = new Scale(new Vector3(scale, scale, 1));
            Vector2 offset = ContentBounds(layoutWidth, layoutHeight).position;
            root.style.left = offset.x;
            root.style.top = offset.y;
            if (compilerOptions != null)
            {
                VisualElement parent = portrait || compact ? root.Q(className: "shaft-controls") : compilerMachine.parent;
                if (compilerOptions.parent != parent)
                {
                    compilerOptions.RemoveFromHierarchy();
                    parent.Add(compilerOptions);
                }
                var navigation = root.Q(className: "navigation");
                VisualElement navigationParent = compact ? root.Q("header") : root.Q("shaft");
                if (navigation.parent != navigationParent)
                {
                    navigation.RemoveFromHierarchy();
                    navigationParent.Add(navigation);
                }
            }
        }

        private void ConfigureWorld()
        {
            root.AddToClassList("perspective");
            shownViewport = -1;
            game.Perspective.Show();
            var screen = root.Q("screen");
            var dock = root.Q("dock");
            dock.RemoveFromHierarchy();
            screen.Insert(2, dock);
        }

        private void PositionLanding(VisualElement landing, int slot)
        {
            if (IsPortraitViewport(Screen.width, Screen.height))
            {
                landing.style.top = 0;
                return;
            }
            if (IsCompactLandscape(Screen.width, Screen.height))
            {
                landing.style.top = 8;
                return;
            }
            Vector2 position = game.Perspective.LandingScreenPosition(State.viewport + slot);
            Vector2 logical = ScreenToLogical(new Vector2(position.x, Screen.height - position.y), Screen.width, Screen.height);
            float floorsTop = (root.Q("floors").worldBound.yMin - root.worldBound.yMin) / ViewportScale(Screen.width, Screen.height);
            landing.style.top = logical.y - floorsTop - landing.resolvedStyle.height / 2;
        }

        public void Initialize(MathscriptIdleMiner owner)
        {
            game = owner;
            panel = ScriptableObject.CreateInstance<PanelSettings>();
            panel.themeStyleSheet = Resources.Load<ThemeStyleSheet>("Tycoon/UI/TycoonTheme");
            panel.scaleMode = PanelScaleMode.ConstantPixelSize;
            panel.scale = 1;
            panel.referenceResolution = new Vector2Int(LogicalWidth, LogicalHeight);
            var document = gameObject.AddComponent<UIDocument>();
            document.panelSettings = panel;
            root = document.rootVisualElement;
            Resources.Load<VisualTreeAsset>("Tycoon/UI/Tycoon").CloneTree(root);
            root.styleSheets.Add(Resources.Load<StyleSheet>("Tycoon/UI/Tycoon"));
            root.styleSheets.Add(Resources.Load<StyleSheet>("Tycoon/UI/Dashboard"));
            root.style.unityFont = Resources.Load<Font>("Tycoon/Rajdhani");
            root.style.position = Position.Absolute;
            root.style.width = LogicalWidth;
            root.style.height = LogicalHeight;
            root.style.transformOrigin = new TransformOrigin(0, 0, 0);
            root.style.overflow = Overflow.Hidden;
            ConfigureViewport();
            overlay = root.Q("overlay");
            overlay.style.display = DisplayStyle.None;
            root.RegisterCallback<KeyDownEvent>(HandleKeys, TrickleDown.TrickleDown);
            CreateHeader();
            CreateOperations();
            CreateWorld();
            CreateDock();
            overlay.BringToFront();
            ConfigureWorld();
            layoutWidth = -1;
            Refresh();
            OpenOfflineProgress();
        }

        private static VisualElement Element(VisualElement parent, string className)
        {
            var element = new VisualElement();
            element.AddToClassList(className);
            parent.Add(element);
            return element;
        }

        private static Label Text(VisualElement parent, string value, string className = null)
        {
            var label = new Label(value);
            if (className != null) label.AddToClassList(className);
            parent.Add(label);
            return label;
        }

        private Button Command(VisualElement parent, string title, Action action, string className = null)
        {
            var control = new Button(() => { action(); game.Persist(); Refresh(); }) { text = title, tooltip = title };
            if (className != null) control.AddToClassList(className);
            parent.Add(control);
            return control;
        }

        private static string Number(double value) => MathscriptNumber.Compact(value);
        private static string Phase(string value) => value == "IDLE" ? "READY" : value == "MOVING_UP" ? "TRAVELLING" : value.Replace('_', ' ');

        private Label Readout(Label label, string name)
        {
            label.name = name;
            readouts.Add(label);
            return label;
        }

        private void CreateHeader()
        {
            var header = root.Q("header");
            var brand = Element(header, "brand-lockup");
            Text(brand, "MATHSCRIPT", "brand");
            Text(brand, "UNDERGROUND DATA CENTER", "brand-subtitle");
            var money = Element(header, "header-money");
            Text(money, "AVAILABLE CASH", "cash-title");
            coins = Readout(Text(money, "", "currency"), "cash");
            income = Readout(Text(money, "", "header-income"), "estimated-income");
            var resources = Element(header, "header-resources");
            bins = Readout(Chip(resources, "STOCK RC"), "floor-stock");
            payload = Readout(Chip(resources, "LIFT RC"), "lift-stock");
            buffer = Readout(Chip(resources, "QUEUE RC"), "vault-stock");
            Command(header, "COMPANY", OpenCompany);
        }

        private static Label Chip(VisualElement parent, string title)
        {
            var chip = Element(parent, "chip");
            var value = Text(chip, "0");
            Text(chip, title, "muted");
            return value;
        }

        private void CreateOperations()
        {
            var operations = root.Q("operations");
            var objective = Element(operations, "objective");
            objectiveHeading = Text(objective, "", "gold");
            flow = Text(objective, "", "muted");
            objectiveLabel = Text(objective, "", "objective-label");
            objectiveProgress = Element(Element(objective, "objective-track"), "objective-fill");
            production = Readout(Metric(operations, "OUTPUT", "RC / SECOND"), "production-rate");
            busMetric = Readout(Metric(operations, "LIFT", "RATED RC / SECOND"), "bus-rate");
            compilerMetric = Readout(Metric(operations, "COMPILER", "RATED RC / SECOND"), "compiler-rate");
            productionDetail = production.parent.Q<Label>(className: "metric-detail");
            busDetail = busMetric.parent.Q<Label>(className: "metric-detail");
            compilerDetail = compilerMetric.parent.Q<Label>(className: "metric-detail");
            var next = Element(operations, "recommendation");
            recommendation = Text(next, "", "recommendation-label");
            invest = Command(next, "INVEST", () =>
            {
                if (State.SuggestedInvestment.kind == MathscriptInvestmentKind.Refactor) OpenRefactor();
                else if (State.SuggestedInvestment.kind == MathscriptInvestmentKind.Quest) OpenQuest(State.SuggestedInvestment.index);
                else if (State.Invest()) shownViewport = -1;
            }, "invest");
        }

        private static Label Metric(VisualElement parent, string title, string detail)
        {
            var metric = Element(parent, "metric");
            Text(metric, title, "muted");
            var value = Text(metric, "", "metric-value");
            Text(metric, detail, "muted").AddToClassList("metric-detail");
            return value;
        }

        private void CreateWorld()
        {
            var surface = root.Q("surface");
            Text(surface, "MATHSCRIPT / DATA CENTER", "surface-title");
            Text(surface, "PRODUCTION  >  DATA BUS  >  COMPILATION", "surface-flow");
            var shaft = root.Q("shaft");
            Command(Element(shaft, "shaft-controls"), "BUS OPTIONS", () => OpenSector(true));
            var navigation = Element(shaft, "navigation");
            floorRange = Text(navigation, "", "muted");
            up = Command(navigation, "^", () => State.viewport--);
            up.tooltip = "Previous department";
            down = Command(navigation, "v", () => State.viewport++);
            down.tooltip = "Deeper departments";
        }

        private Texture2D Portrait(int floor)
        {
            string[] names = { "arcanos", "blaze", "luna", "zenith", "titan", "tempest", "shadow" };
            var portrait = Resources.Load<Texture2D>("Tycoon/" + names[floor] + ".svg");
            if (portrait == null) throw new InvalidOperationException("Missing hero portrait: " + names[floor]);
            return portrait;
        }

        private void CreateFloors()
        {
            shownViewport = State.viewport;
            shownRooms = RoomMask();
            shownEvolution = EvolutionMask();
            refreshers.Clear();
            Array.Clear(landings, 0, landings.Length);
            shownFloorCount = VisibleFloorCount;
            var floors = root.Q("floors");
            floors.Clear();
            for (int order = 0; order < VisibleFloorCount; order++)
            {
                int slot = order;
                int floor = State.viewport + slot;
                if (floor > 6) continue;
                if (State.levels[floor] == 0)
                {
                    var construction = Element(floors, "construction");
                    landings[slot] = construction;
                    PositionLanding(construction, slot);
                    Text(construction, MathscriptEconomy.FloorNames[floor], "construction-title");
                    var build = Command(construction, "+ BUILD DEPARTMENT  /  $" + Number(State.FloorCost(floor)), () =>
                    {
                        State.UpgradeFloor(floor);
                        shownViewport = -1;
                    }, "invest");
                    build.tooltip = "Build " + MathscriptEconomy.FloorNames[floor];
                    refreshers.Add(() => build.SetEnabled(Array.FindIndex(State.levels, value => value == 0) == floor && State.coins >= State.FloorCost(floor)));
                    continue;
                }
                var room = Element(floors, "room");
                landings[slot] = room;
                PositionLanding(room, slot);
                Color[] colors = { new Color32(36,190,174,255), new Color32(240,112,96,255), new Color32(75,166,224,255), new Color32(239,191,65,255), new Color32(78,191,116,255), new Color32(128,153,217,255), new Color32(110,214,198,255) };
                room.style.borderLeftColor = colors[floor];
                room.style.borderTopColor = colors[floor];
                room.name = "department-" + floor;
                var manager = Element(room, "manager-area");
                Text(manager, "DEPT " + (floor + 1), "muted");
                var portrait = Command(manager, "", () => OpenFloor(floor), "portrait");
                portrait.tooltip = "Open " + MathscriptEconomy.FloorNames[floor] + " manager";
                portrait.style.backgroundImage = new StyleBackground(Portrait(floor));
                var bin = Text(manager, "", "bin");
                var main = Element(room, "room-main");
                Text(main, MathscriptEconomy.FloorNames[floor], "room-title");
                var rate = Text(main, "", "room-rate");
                var generate = Command(main, "GENERATE", () => Generate(floor), "generate");
                generate.tooltip = "Generate RC in this server room";
                var options = Element(room, "options-area");
                var level = Text(options, "", "gold");
                var option = Command(options, "OPTIONS", () => OpenFloor(floor), "floor-options");
                var automation = Text(options, "", "muted");
                var milestone = Text(room, "", "floor-milestone");
                var milestoneFill = Element(Element(room, "floor-milestone-track"), "floor-milestone-fill");
                refreshers.Add(() =>
                {
                    bin.text = Number(State.bins[floor]) + "\nRC";
                    rate.text = State.hired[floor] ? Number(State.FloorRate(floor)) + " RC/s" : "+" + Number(State.GenerationYield(floor)) + " RC / action";
                    rate.tooltip = State.hired[floor] ? MathscriptNumber.Exact(State.FloorRate(floor)) + " RC per second, automated" : MathscriptNumber.Exact(State.GenerationYield(floor)) + " RC per Generate action";
                    generate.tooltip = "Generate +" + MathscriptNumber.Exact(State.GenerationYield(floor)) + " RC";
                    bin.tooltip = "Department stock: " + MathscriptNumber.Exact(State.bins[floor]) + " RC";
                    level.text = "LEVEL " + State.levels[floor];
                    option.text = "OPTIONS\n$" + Number(State.FloorCost(floor));
                    option.EnableInClassList("invest", State.coins >= State.FloorCost(floor));
                    automation.text = State.hired[floor] ? "AUTO" : "MANUAL";
                    int target = State.NextFloorMilestone(floor);
                    milestone.text = target > 0 ? "NEXT LV " + target + " / " + State.levels[floor] + " OF " + target : "MILESTONES COMPLETE";
                    milestoneFill.style.width = Length.Percent(target > 0 ? Mathf.Min(100, State.levels[floor] * 100f / target) : 100);
                });
            }
            status = Text(floors, game.Status, "world-status");
        }

        private void CreateDock()
        {
            var dock = root.Q("dock");
            var inner = Element(dock, "dock-inner");
            var sector = Element(inner, "dock-sector");
            Text(sector, "PIPELINE", "gold");
            Text(sector, "OPERATIONS", "muted");
            var actions = Element(inner, "dock-actions");
            var sendArea = Element(actions, "dock-action");
            send = Command(sendArea, "SEND", () => State.SendBus(), "send");
            busPhase = Text(sendArea, "", "dock-detail");
            liftCargo = Text(sendArea, "", "cargo-detail");
            liftLoad = Element(Element(sendArea, "pipeline-track"), "pipeline-fill");
            var compileArea = Element(actions, "dock-action");
            compile = Command(compileArea, "COMPILE", () => State.Compile(), "compile");
            compilerPhase = Text(compileArea, "", "dock-detail");
            var compilerSector = compileArea;
            compilerMachine = Element(compilerSector, "compiler-machine");
            compilerWheel = Element(compilerMachine, "compiler-wheel");
            Element(compilerWheel, "wheel-spoke");
            var secondSpoke = Element(compilerWheel, "wheel-spoke");
            secondSpoke.style.rotate = new Rotate(90);
            Text(compilerMachine, "PROCESSOR", "machine-title");
            for (int index = 0; index < 5; index++)
            {
                var bar = Element(compilerMachine, "compute-bar");
                bar.style.left = 42 + index * 23;
                computeBars.Add(bar);
            }
            compilerProgress = Element(compilerMachine, "compiler-progress");
            compilerOutput = Text(compilerMachine, "", "compiler-output");
            compilerOptions = Command(compilerSector, "COMPILER OPTIONS", () => OpenSector(false), "compiler-options");
            CreateContractDock(actions);
        }

        private void OpenDialog(string title, bool bonus = false)
        {
            if (overlay.style.display == DisplayStyle.None) returnFocus = root.focusController.focusedElement as VisualElement;
            challengeDialog = bonus;
            overlay.Clear();
            dialogRefreshers.Clear();
            overlay.style.display = DisplayStyle.Flex;
            root.Q("header").SetEnabled(false);
            root.Q("operations").SetEnabled(false);
            root.Q("world").SetEnabled(false);
            root.Q("dock").SetEnabled(false);
            dialogScroll = new ScrollView(ScrollViewMode.Vertical);
            dialogScroll.AddToClassList("dialog");
            dialogScroll.horizontalScrollerVisibility = ScrollerVisibility.Hidden;
            dialogScroll.verticalScrollerVisibility = ScrollerVisibility.Auto;
            overlay.Add(dialogScroll);
            dialog = dialogScroll.contentContainer;
            Text(dialog, title, "dialog-title");
        }

        private void FocusDialog() => dialog.schedule.Execute(() => dialog.Query<Button>().ToList().Find(control => control.enabledInHierarchy && control.style.display != DisplayStyle.None)?.Focus());

        private void OpenOfflineProgress()
        {
            MathscriptOfflineProgress progress = game.OfflineProgress;
            if (progress == null || progress.seconds < 60 || progress.earnings <= 0 && progress.producedRC <= 0 && progress.compiledRC <= 0) return;
            OpenDialog("WELCOME BACK");
            Text(dialog, "Away: " + TimeSpan.FromSeconds(progress.seconds).ToString(@"hh\:mm\:ss") + (progress.capped ? " / 8h limit" : ""), "muted");
            Text(dialog, "+$" + Number(progress.earnings), "return-earnings");
            Text(dialog, "Produced " + Number(progress.producedRC) + " RC / Compiled " + Number(progress.compiledRC) + " RC");
            Text(dialog, "Floor stock " + Number(State.FloorBin) + " RC / Vault " + Number(State.compilerBuffer) + " RC", "muted");
            Command(dialog, "CONTINUE", CloseDialog, "invest");
            FocusDialog();
        }

        private void CloseDialog()
        {
            overlay.style.display = DisplayStyle.None;
            dialogRefreshers.Clear();
            root.Q("header").SetEnabled(true);
            root.Q("operations").SetEnabled(true);
            root.Q("world").SetEnabled(true);
            root.Q("dock").SetEnabled(true);
            returnFocus?.Focus();
            if (!challengeDialog && State.PendingChallenge >= 0) shownChallenge = -1;
            challengeDialog = false;
        }

        private (double cost, int count) FloorPurchase(int floor) => State.QuoteFloorUpgrade(floor, bulk);

        private void OpenFloor(int floor)
        {
            OpenDialog(MathscriptEconomy.FloorNames[floor]);
            var details = Text(dialog, "");
            var milestone = Text(dialog, "", "gold");
            var modes = Element(dialog, "modes");
            foreach (int quantity in new[] { 1, 10, 50, -1 })
            {
                int selected = quantity;
                var mode = Command(modes, selected < 0 ? "MAX" : "x" + selected, () => bulk = selected);
                dialogRefreshers.Add(() => mode.EnableInClassList("selected", bulk == selected));
            }
            var upgrade = Command(dialog, "", () => State.UpgradeFloor(floor, bulk), "invest");
            var hire = Command(dialog, "", () => State.HireFloor(floor));
            AddManagerSkill(floor);
            Command(dialog, "CLOSE", CloseDialog);
            dialogRefreshers.Add(() =>
            {
                var purchase = FloorPurchase(floor);
                details.text = "Level " + State.levels[floor] + "  /  " + Number(State.FloorRate(floor)) + " RC/s\nOutput bin: " + Number(State.bins[floor]) + " RC";
                int target = State.NextFloorMilestone(floor);
                milestone.text = target > 0 ? "Next output milestone: level " + target : "All output milestones reached";
                bool available = purchase.count > 0 && (bulk < 0 || purchase.count == bulk) && State.coins >= purchase.cost;
                double required = bulk > 0 && purchase.count == bulk ? purchase.cost : State.FloorCost(floor);
                upgrade.text = available ? "UPGRADE +" + purchase.count + "  /  $" + Number(purchase.cost) : "UPGRADE  /  NEED $" + Number(required);
                upgrade.SetEnabled(available);
                double cost = MathscriptEconomy.BaseCosts[floor] * 6;
                hire.text = State.hired[floor] ? "MANAGER HIRED" : "HIRE MANAGER  /  $" + Number(cost);
                hire.SetEnabled(!State.hired[floor] && State.coins >= cost);
            });
            FocusDialog();
        }

        private void OpenSector(bool bus)
        {
            OpenDialog(bus ? "DATA BUS OPTIONS" : "COMPILER OPTIONS");
            Text(dialog, bus ? "Transport room output to the loading dock." : "Convert delivered RC into company income.", "muted");
            for (int track = bus ? 0 : 3; track < (bus ? 3 : 6); track++)
            {
                int selected = track;
                var row = Element(dialog, "upgrade-row");
                var info = Element(row, "upgrade-info");
                Text(info, MathscriptEconomy.TrackNames[track]);
                var detail = Text(info, "", "muted");
                var upgrade = Command(row, "", () => State.UpgradeTrack(selected), "invest");
                dialogRefreshers.Add(() =>
                {
                    double[] values = { State.BusCapacity, State.BusSpeed, State.LoadingSeconds, State.BatchSize, State.ProcessingSeconds, State.Conversion };
                    string[] units = { " RC", "x speed", " sec", " RC", " sec", " $ / RC" };
                    detail.text = "Lv " + State.tracks[selected] + "  /  " + Number(values[selected]) + units[selected];
                    upgrade.text = State.TrackCapped(selected) ? "MAX" : "$" + Number(State.TrackCost(selected));
                    upgrade.SetEnabled(!State.TrackCapped(selected) && State.coins >= State.TrackCost(selected));
                });
            }
            var hire = Command(dialog, "", () => State.HireSector(bus));
            AddManagerSkill(bus ? 7 : 8);
            dialogRefreshers.Add(() =>
            {
                bool hired = bus ? State.busManager : State.compilerManager;
                double price = bus ? 350 : 750;
                hire.text = hired ? "MANAGER HIRED / AUTOMATED" : "HIRE MANAGER / $" + price;
                hire.SetEnabled(!hired && State.coins >= price);
            });
            Command(dialog, "CLOSE", CloseDialog);
            FocusDialog();
        }

        private void AddManagerSkill(int manager)
        {
            var activate = Command(dialog, "ACTIVATE SKILL", () => State.ActivateSkill(manager));
            dialogRefreshers.Add(() =>
            {
                bool employed = manager < 7 ? State.hired[manager] : manager == 7 ? State.busManager : State.compilerManager;
                double remaining = State.CooldownSeconds(manager);
                activate.text = State.SkillActive(manager) ? "ACTIVE / " + Math.Ceiling(State.SkillSeconds(manager)) + "s"
                    : remaining > 0 ? "COOLDOWN / " + Math.Ceiling(remaining) + "s" : "ACTIVATE SKILL";
                activate.SetEnabled(employed && remaining <= 0);
            });
        }

        private void OpenCompany()
        {
            OpenDialog("COMPANY DEVELOPMENT");
            var ledger = Element(dialog, "company-ledger");
            var available = Ledger(ledger, "Available cash");
            var earned = Ledger(ledger, "Lifetime earnings");
            var recurring = Ledger(ledger, "Estimated automated income");
            var processed = Ledger(ledger, "Completed output");
            var queued = Ledger(ledger, "Queued / processing");
            var managers = Ledger(ledger, "Automation");
            var summary = Text(dialog, "", "company-summary");
            dialogRefreshers.Add(() =>
            {
                available.text = MathscriptNumber.Money(State.coins);
                available.tooltip = "$" + MathscriptNumber.Exact(State.coins);
                earned.text = MathscriptNumber.Money(State.lifetime);
                earned.tooltip = "$" + MathscriptNumber.Exact(State.lifetime);
                recurring.text = "~" + MathscriptNumber.Money(State.EstimatedIncome) + " / s";
                processed.text = Number(State.compiledRC) + " RC";
                processed.tooltip = MathscriptNumber.Exact(State.compiledRC) + " RC completed";
                queued.text = Number(State.compilerBuffer) + " / " + Number(State.processingBatch) + " RC";
                managers.text = State.AutomationCount + " / " + State.AutomationTarget + " managed";
                summary.text = "PERMANENT BOOST " + Number(State.GlobalMultiplier) + "x   /   " + Number(State.claimedTokens) + " TOKENS";
            });
            Command(dialog, "COMPANY CONTRACTS", OpenContracts, "invest");
            for (int node = 0; node < 3; node++)
            {
                int selected = node;
                var purchase = Command(dialog, MathscriptEconomy.ResearchNames[node], () => State.BuyResearch(selected));
                dialogRefreshers.Add(() =>
                {
                    purchase.text = MathscriptEconomy.ResearchNames[selected] + " / " + (State.research[selected] ? "OWNED" : "$" + Number(MathscriptEconomy.ResearchCosts[selected]));
                    purchase.SetEnabled(!State.research[selected] && (selected == 0 || State.research[selected - 1]) && State.coins >= MathscriptEconomy.ResearchCosts[selected]);
                });
            }
            for (int quest = 0; quest < 3; quest++)
            {
                int selected = quest;
                var open = Command(dialog, MathscriptEconomy.QuestNames[quest], () => OpenQuest(selected));
                dialogRefreshers.Add(() => open.SetEnabled(State.QuestAvailable(selected)));
            }
            var refactor = Command(dialog, "PRIME REFACTOR", OpenRefactor);
            dialogRefreshers.Add(() =>
            {
                refactor.text = "PRIME REFACTOR / +" + Number(State.RefactorReward) + " TOKENS";
                refactor.SetEnabled(State.RefactorReward > 0);
            });
            Command(dialog, "CLOSE", CloseDialog);
            FocusDialog();
        }

        private static Label Ledger(VisualElement parent, string title)
        {
            var row = Element(parent, "ledger-row");
            Text(row, title, "ledger-title");
            return Text(row, "", "ledger-value");
        }

        private void OpenQuest(int quest)
        {
            if (quest < 0 || quest >= MathscriptEconomy.QuestNames.Length) return;
            OpenDialog(MathscriptEconomy.QuestNames[quest]);
            Text(dialog, MathscriptEconomy.QuestQuestions[quest], "quest-question");
            var reward = Text(dialog, "Reward: " + MathscriptNumber.Money(MathscriptEconomy.QuestRewards[quest]), "quest-reward");
            reward.name = "quest-reward";
            var answers = Element(dialog, "quest-answers");
            var commands = new List<Button>();
            Label feedback = null;
            VisualElement illustration = null;
            Button back = null;
            Button next = null;
            Action showSolution = () =>
            {
                foreach (Button answer in commands) answer.SetEnabled(false);
                feedback.text = MathscriptEconomy.QuestExplanations[quest];
                feedback.EnableInClassList("quest-hint", false);
                feedback.AddToClassList("quest-solution");
                illustration.style.display = DisplayStyle.Flex;
                back.style.display = DisplayStyle.None;
                next.style.display = DisplayStyle.Flex;
                next.Focus();
                dialogScroll.ScrollTo(feedback);
            };
            for (int choice = 0; choice < 3; choice++)
            {
                int selected = choice;
                var answer = Command(answers, MathscriptEconomy.QuestChoices[quest][choice], () =>
                {
                    if (State.questsDone[quest]) return;
                    if (State.AnswerQuest(quest, selected))
                    {
                        game.Persist();
                        reward.text = "Awarded: " + MathscriptNumber.Money(MathscriptEconomy.QuestRewards[quest]);
                        showSolution();
                    }
                    else
                    {
                        feedback.text = State.QuestAvailable(quest) ? MathscriptEconomy.QuestHints[quest] : "This department objective is not available yet.";
                        feedback.AddToClassList("quest-hint");
                        dialogScroll.ScrollTo(feedback);
                    }
                }, "quest-answer");
                commands.Add(answer);
                dialogRefreshers.Add(() => answer.SetEnabled(State.QuestAvailable(quest)));
            }
            feedback = Text(dialog, "", "quest-feedback");
            feedback.name = "quest-feedback";
            illustration = Element(dialog, "quest-illustration");
            illustration.name = "quest-illustration";
            string[][] diagrams = {
                new[] { "6 RC", "6 RC", "6 RC", "6 RC", "6 RC" },
                new[] { "SERVERS\n10 RC/s", "LIFT\n4 RC/s", "COMPUTE\n8 RC/s" },
                new[] { "BASE\n100 coins", "10%\n+10 coins", "TOTAL\n110 coins" }
            };
            for (int cell = 0; cell < diagrams[quest].Length; cell++)
            {
                var item = Text(illustration, diagrams[quest][cell], "quest-diagram-cell");
                item.EnableInClassList("quest-diagram-limit", quest == 1 && cell == 1);
            }
            illustration.style.display = DisplayStyle.None;
            back = Command(dialog, "BACK", OpenCompany);
            next = Command(dialog, "CONTINUE", OpenCompany, "invest");
            next.style.display = DisplayStyle.None;
            if (State.questsDone[quest])
            {
                reward.text = "Previously awarded: " + MathscriptNumber.Money(MathscriptEconomy.QuestRewards[quest]);
                showSolution();
                next.schedule.Execute(() => next.Focus());
            }
            else FocusDialog();
        }

        private void OpenRefactor()
        {
            OpenDialog("CONFIRM PRIME REFACTOR");
            Text(dialog, "Reset rooms, cash, managers, active contracts and undelivered cargo for +" + Number(State.RefactorReward) + " permanent tokens. Research and completed contract history are retained.");
            Command(dialog, "REFACTOR", () =>
            {
                if (State.PrimeRefactor()) { shownViewport = -1; CloseDialog(); }
            });
            Command(dialog, "CANCEL", OpenCompany);
            FocusDialog();
        }

        private void OpenChallenge(int challenge)
        {
            shownChallenge = challenge;
            OpenDialog("UPGRADE BONUS  /  +" + MathscriptNumber.Money(MathscriptEconomy.Rewards[challenge]), true);
            Text(dialog, MathscriptEconomy.Questions[challenge]);
            var feedback = Text(dialog, "", "gold");
            for (int choice = 0; choice < 3; choice++)
            {
                int selected = choice;
                Command(dialog, MathscriptEconomy.Choices[challenge][choice], () =>
                {
                    if (State.AnswerChallenge(selected)) { game.SetStatus("Math bonus earned"); CloseDialog(); }
                    else feedback.text = "Not quite. Try again.";
                });
            }
            Command(dialog, "SKIP BONUS", () => { State.SkipChallenge(); CloseDialog(); });
            FocusDialog();
        }

        private void HandleKeys(KeyDownEvent input)
        {
            if (overlay.style.display == DisplayStyle.None) return;
            if (input.keyCode == KeyCode.Escape)
            {
                if (challengeDialog) State.SkipChallenge();
                CloseDialog();
                game.Persist();
                input.StopImmediatePropagation();
            }
            else if (input.keyCode == KeyCode.Tab)
            {
                var controls = dialog.Query<Button>().ToList().FindAll(control => control.enabledInHierarchy);
                int current = controls.FindIndex(control => control == root.focusController.focusedElement);
                if (controls.Count > 0)
                {
                    var next = controls[(current + (input.shiftKey ? controls.Count - 1 : 1)) % controls.Count];
                    next.Focus();
                    dialogScroll.ScrollTo(next);
                }
                root.focusController.IgnoreEvent(input);
                input.StopImmediatePropagation();
            }
        }

        private void Update() { if (root != null) Refresh(); }

        private void Generate(int floor)
        {
            if (State.Generate(floor)) workStarted[floor] = Time.time;
        }

        internal float WorkElapsed(int floor) => Time.time - workStarted[floor];

        private static Texture2D Frame()
        {
            var frame = new Texture2D(Screen.width, Screen.height, TextureFormat.RGB24, false);
            frame.ReadPixels(new Rect(0, 0, Screen.width, Screen.height), 0, 0);
            frame.Apply();
            return frame;
        }

        private void AssertMotion(Texture2D before, Texture2D after, Rect region, string stage)
        {
            float scale = ViewportScale(Screen.width, Screen.height);
            int changed = 0;
            int left = Mathf.Clamp(Mathf.RoundToInt(region.xMin), 0, Screen.width - 1);
            int right = Mathf.Clamp(Mathf.RoundToInt(region.xMax), left + 1, Screen.width);
            int bottom = Mathf.Clamp(Screen.height - Mathf.RoundToInt(region.yMax), 0, Screen.height - 1);
            int top = Mathf.Clamp(Screen.height - Mathf.RoundToInt(region.yMin), bottom + 1, Screen.height);
            for (int row = bottom; row < top; row++)
                for (int column = left; column < right; column++)
                {
                    Color first = before.GetPixel(column, row);
                    Color second = after.GetPixel(column, row);
                    if (Mathf.Abs(first.r - second.r) + Mathf.Abs(first.g - second.g) + Mathf.Abs(first.b - second.b) > 0.2f) changed++;
                }
            if (changed < 350 * scale * scale) throw new InvalidOperationException(stage + " rendered motion too small: " + changed);
            Debug.Log("MATHSCRIPT_MOTION_PASS stage=" + stage + " changedPixels=" + changed);
            Destroy(before);
            Destroy(after);
        }

        private int RoomMask()
        {
            int mask = 0;
            for (int floor = 0; floor < 7; floor++) if (State.levels[floor] > 0) mask |= 1 << floor;
            return mask;
        }

        public static int WorkerCount(int level) => level >= 50 ? 4 : level >= 25 ? 3 : level >= 10 ? 2 : 1;

        private int EvolutionMask()
        {
            int signature = 0;
            for (int floor = 0; floor < 7; floor++) signature |= (WorkerCount(State.levels[floor]) - 1) << (floor * 2);
            return signature;
        }

        private void Refresh()
        {
            ConfigureViewport();
            State.viewport = Math.Min(State.viewport, VisibleFloorCount == 1 ? 6 : 5);
            game.Perspective.SetFrameRect(LogicalWorldBounds);
            if (shownViewport != State.viewport || shownRooms != RoomMask() || shownEvolution != EvolutionMask() || shownFloorCount != VisibleFloorCount) CreateFloors();
            for (int landingSlot = 0; landingSlot < landings.Length; landingSlot++)
                if (landings[landingSlot] != null) PositionLanding(landings[landingSlot],landingSlot);
            coins.text = MathscriptNumber.Money(State.coins);
            coins.tooltip = "Available cash: $" + MathscriptNumber.Exact(State.coins);
            income.text = "~" + MathscriptNumber.Money(State.EstimatedIncome) + "/s AUTO";
            income.tooltip = "Estimated recurring income from the limiting managed pipeline stage";
            bins.text = Number(State.FloorBin);
            payload.text = Number(State.busPayload);
            buffer.text = Number(State.compilerBuffer);
            bins.tooltip = MathscriptNumber.Exact(State.FloorBin) + " RC waiting in departments";
            payload.tooltip = MathscriptNumber.Exact(State.busPayload) + " / " + MathscriptNumber.Exact(State.tripCapacity > 0 && State.busState != "IDLE" ? State.tripCapacity : State.BusCapacity) + " RC in the lift";
            buffer.tooltip = MathscriptNumber.Exact(State.compilerBuffer) + " RC queued; " + MathscriptNumber.Exact(State.processingBatch) + " RC processing";
            production.text = Number(State.TotalProduction);
            productionDetail.text = State.TotalProduction > 0 ? "RC/s / AUTOMATED" : "RC/s / MANUAL ONLY";
            double busRate = State.NominalBusRate;
            double compilerRate = State.NominalCompilerRate;
            busMetric.text = Number(busRate);
            compilerMetric.text = Number(compilerRate);
            busDetail.text = "RC/s RATED / " + (State.busManager ? "AUTO" : "MANUAL");
            compilerDetail.text = "RC/s RATED / " + (State.compilerManager ? "AUTO" : "MANUAL");
            production.tooltip = MathscriptNumber.Exact(State.TotalProduction) + " RC per second from hired managers";
            busMetric.tooltip = "Nominal lift capacity: " + MathscriptNumber.Exact(busRate) + " RC per second";
            compilerMetric.tooltip = "Nominal compiler capacity: " + MathscriptNumber.Exact(compilerRate) + " RC per second";
            flow.text = "FLOW BONUS +" + Number((State.FlowMultiplier() - 1) * 100) + "%";
            RefreshInvestment(busRate, compilerRate);
            busPhase.text = Phase(State.busState) + (State.busManager ? " / AUTO" : " / MANUAL");
            compilerPhase.text = Phase(State.compilerState) + (State.compilerManager ? " / AUTO" : " / MANUAL");
            double capacity = State.busState != "IDLE" ? State.tripCapacity : State.BusCapacity;
            liftCargo.text = Number(State.busPayload) + " / " + Number(capacity) + " RC";
            liftLoad.style.width = Length.Percent(capacity > 0 ? (float)Math.Min(100, State.busPayload * 100 / capacity) : 0);
            liftCargo.tooltip = payload.tooltip;
            compile.tooltip = "Compile RC / " + compilerPhase.text;
            floorRange.text = "DEPTH " + (State.viewport + 1) + " - " + Math.Min(7,State.viewport + VisibleFloorCount);
            up.SetEnabled(State.viewport > 0);
            down.SetEnabled(State.viewport < (VisibleFloorCount == 1 ? 6 : 5));
            send.SetEnabled(State.busState == "IDLE" && State.FloorBin > 0);
            compile.SetEnabled(State.compilerState == "IDLE" && State.compilerBuffer > 0);
            send.tooltip = State.busState != "IDLE" ? "Lift " + Phase(State.busState).ToLowerInvariant() : State.FloorBin <= 0 ? "No department stock to collect" : "Collect " + MathscriptNumber.Exact(Math.Min(State.FloorBin, capacity)) + " RC";
            compile.tooltip = State.compilerState != "IDLE" ? "Compiler " + Phase(State.compilerState).ToLowerInvariant() : State.compilerBuffer <= 0 ? "Compute queue empty; send the lift first" : "Compile up to " + MathscriptNumber.Exact(Math.Min(State.BatchSize, State.compilerBuffer)) + " RC";
            AnimatePipeline();
            RefreshContractDock();
            foreach (var refresh in refreshers) refresh();
            foreach (var refresh in dialogRefreshers) refresh();
            status.text = game.Status;
            int challenge = State.PendingChallenge;
            if (challenge >= 0 && challenge != shownChallenge) OpenChallenge(challenge);
            if (challenge < 0)
            {
                if (challengeDialog) CloseDialog();
                shownChallenge = -1;
            }
        }

        private void RefreshInvestment(double busRate, double compilerRate)
        {
            MathscriptInvestment candidate = State.SuggestedInvestment;
            MathscriptOperationsGoal goal = State.OperationsGoal;
            objectiveHeading.text = goal.heading;
            objectiveLabel.text = goal.title;
            objectiveProgress.style.width = Length.Percent((float)(goal.progress * 100));
            recommendation.text = candidate.title + "\n" + (candidate.cost > 0 ? candidate.action + " / $" + Number(candidate.cost) : candidate.action);
            invest.text = candidate.action + (candidate.cost > 0 ? "\n$" + Number(candidate.cost) : "");
            invest.tooltip = candidate.action + " / " + candidate.title + (candidate.cost > 0 ? " / $" + Number(candidate.cost) : "");
            invest.SetEnabled(State.coins >= candidate.cost);
            production.parent.EnableInClassList("bottleneck", State.TotalProduction > 0 && State.TotalProduction <= Math.Min(busRate, compilerRate));
            busMetric.parent.EnableInClassList("bottleneck", State.busManager && busRate < State.TotalProduction && busRate <= compilerRate);
            compilerMetric.parent.EnableInClassList("bottleneck", State.compilerManager && compilerRate < Math.Min(busRate, State.TotalProduction));
        }

        private void AnimatePipeline()
        {
            bool processing = State.compilerState == "PROCESSING";
            compilerWheel.style.rotate = new Rotate(processing ? Time.time * 540 : 0);
            compilerMachine.style.backgroundColor = processing ? new Color(0.2f, 0.5f + Mathf.Sin(Time.time * 9) * 0.1f, 0.45f) : new Color(0.1f, 0.16f, 0.17f);
            int barIndex = 0;
            foreach (var bar in computeBars)
            {
                bar.style.height = processing ? 5 + Mathf.Abs(Mathf.Sin(Time.time * 13 + barIndex)) * 14 : 3;
                bar.style.backgroundColor = processing ? new Color(0.95f, 0.8f, 0.4f) : new Color(0.25f, 0.35f, 0.35f);
                barIndex++;
            }
            compilerProgress.style.width = Length.Percent(processing ? 100 * (1 - (float)(State.compilerRemaining / State.cycleProcessing)) : 0);
            if (State.compiledRC > lastCompiled) payoutAt = Time.time;
            lastCompiled = State.compiledRC;
            compilerOutput.text = Time.time - payoutAt < 1.2f ? State.HasCompanyContract ? "RC" : "$" : "";
            compilerOutput.style.translate = new Translate(0, -Mathf.Clamp01((Time.time - payoutAt) / 1.2f) * 36);
            compilerOutput.style.opacity = 1 - Mathf.Clamp01((Time.time - payoutAt) / 1.2f);
        }

        public void AssertLayout()
        {
            AssertFixedViewport();
            if (coins.text != MathscriptNumber.Money(State.coins) || production.text != Number(State.TotalProduction) || income.text != "~" + MathscriptNumber.Money(State.EstimatedIncome) + "/s AUTO")
                throw new InvalidOperationException("Dashboard readouts do not match the economy");
            string[] bands = { "header", "operations", "dock", "world" };
            float bottom = root.worldBound.yMin;
            foreach (string band in bands)
            {
                var box = root.Q(band).worldBound;
                if (box.height <= 0 || box.y < bottom - 1 || box.yMax > root.worldBound.yMax + 1 || box.xMin < root.worldBound.xMin - 1 || box.xMax > root.worldBound.xMax + 1)
                    throw new InvalidOperationException("UI band overlaps, escapes the content, or is empty: " + band);
                bottom = box.yMax;
            }
            if (root.Q("floors").childCount < 2 || coins.resolvedStyle.unityFont == null) throw new InvalidOperationException("Mathscript UI assets or rooms missing");
            foreach (var control in root.Q("dock").Query<Button>().ToList())
            {
                Rect band = root.Q("dock").worldBound;
                float overrun = Mathf.Max(band.yMin - control.worldBound.yMin, control.worldBound.yMax - band.yMax);
                if (overrun > 1) throw new InvalidOperationException("Dock control escaped its band: " + control.text + " physicalOverrun=" + overrun.ToString("F6"));
                if (overrun > 0) Debug.Log("MATHSCRIPT_FIXED_LAYOUT_DOCK_ROUNDING control=" + control.text + " physicalOverrun=" + overrun.ToString("F6"));
            }
            if (root.Q("underground").worldBound.width < root.worldBound.width * 0.85f) throw new InvalidOperationException("Tower is not world dominant");
            foreach (var landing in landings)
                if (landing != null && (landing.worldBound.yMax > root.Q("world").worldBound.yMax + 1 || landing.worldBound.yMin < root.Q("world").worldBound.yMin - 1)) throw new InvalidOperationException("Department escaped world band");
            for (int floor = State.viewport; floor < Math.Min(7,State.viewport + VisibleFloorCount); floor++)
            {
                if (State.levels[floor] == 0) continue;
                var room = root.Q("department-" + floor);
                game.Perspective.AssertDepartment(floor);
                if (room.Q(className: "room-title").worldBound.Overlaps(room.Q(className: "room-rate").worldBound)) throw new InvalidOperationException("Department labels overlap");
            }
        }

        private void AssertFixedViewport()
        {
            float scale = ViewportScale(Screen.width, Screen.height);
            Rect content = ContentBounds(Screen.width, Screen.height);
            Rect actual = root.worldBound;
            bool portrait = IsPortraitViewport(Screen.width, Screen.height);
            bool compact = IsCompactLandscape(Screen.width, Screen.height);
            Vector2 logicalSize = LogicalSize(Screen.width, Screen.height);
            if (panel.scaleMode != PanelScaleMode.ConstantPixelSize || Mathf.Abs(panel.scale - 1) > 0.0001f
                || Mathf.Abs(root.style.width.value.value - logicalSize.x) > 0.01f || Mathf.Abs(root.style.height.value.value - logicalSize.y) > 0.01f
                || Vector3.Distance(root.style.scale.value.value, new Vector3(scale, scale, 1)) > 0.0001f
                || root.style.transformOrigin.value.x.value != 0 || root.style.transformOrigin.value.y.value != 0
                || Mathf.Abs(actual.xMin - content.xMin) > 1 || Mathf.Abs(actual.xMax - content.xMax) > 1
                || Mathf.Abs(actual.yMin - content.yMin) > 1 || Mathf.Abs(actual.yMax - content.yMax) > 1
                || VisibleFloorCount != (portrait || compact ? 1 : 3) || root.ClassListContains("portrait-screen") != portrait
                || root.ClassListContains("compact-screen") != compact
                || root.ClassListContains("phone-screen") || root.ClassListContains("narrow-screen") || root.ClassListContains("landscape-screen") || root.Q("screen").ClassListContains("short-screen"))
                throw new InvalidOperationException("Responsive composition or viewport bounds changed: scale=" + scale
                    + " panelScale=" + panel.scale + " logicalSize=" + root.layout.size.ToString("F4") + " physical=" + actual.ToString("F4") + " expected=" + content.ToString("F4"));
            Rect world = ScreenBounds(root.Q("world"));
            int worldTop = portrait ? PortraitWorldTop : compact ? 268 : LogicalWorldTop;
            Rect expectedWorld = LogicalToScreen(new Rect(0, worldTop, logicalSize.x, logicalSize.y - worldTop), Screen.width, Screen.height);
            if (Mathf.Abs(world.xMin - expectedWorld.xMin) > 1 || Mathf.Abs(world.xMax - expectedWorld.xMax) > 1
                || Mathf.Abs(world.yMin - expectedWorld.yMin) > 1 || Mathf.Abs(world.yMax - expectedWorld.yMax) > 1)
                throw new InvalidOperationException("World band departed from its fixed logical frame: actual=" + world.ToString("F4") + " expected=" + expectedWorld.ToString("F4"));
            Rect cameraBounds = LogicalToScreen(LogicalWorldBounds, Screen.width, Screen.height);
            Rect pixels = GameObject.Find("Perspective Camera").GetComponent<Camera>().pixelRect;
            Rect cameraTopLeft = new Rect(pixels.x, Screen.height - pixels.yMax, pixels.width, pixels.height);
            if (Mathf.Abs(cameraTopLeft.xMin - cameraBounds.xMin) > 1 || Mathf.Abs(cameraTopLeft.xMax - cameraBounds.xMax) > 1
                || Mathf.Abs(cameraTopLeft.yMin - cameraBounds.yMin) > 1 || Mathf.Abs(cameraTopLeft.yMax - cameraBounds.yMax) > 1)
                throw new InvalidOperationException("World camera and UI do not share the content viewport");
            if (root.panel == null) throw new InvalidOperationException("Runtime panel missing for input mapping");
            if (overlay.style.display != DisplayStyle.None)
            {
                Rect viewport = DialogBounds();
                if (viewport.width <= 0 || viewport.height <= 0 || viewport.xMin < content.xMin - 1 || viewport.xMax > content.xMax + 1
                    || viewport.yMin < content.yMin - 1 || viewport.yMax > content.yMax + 1)
                    throw new InvalidOperationException("Dialog viewport escaped letterboxed content");
            }
            var candidates = overlay.style.display == DisplayStyle.None ? root.Q("screen").Query<Button>().ToList() : overlay.Query<Button>().ToList();
            int checkedControls = 0;
            foreach (Button control in candidates)
            {
                if (!Displayed(control) || !control.enabledInHierarchy) continue;
                Rect bounds = ScreenBounds(control);
                if (bounds.xMin < content.xMin - 1 || bounds.xMax > content.xMax + 1 || bounds.yMin < content.yMin - 1 || bounds.yMax > content.yMax + 1)
                {
                    if (overlay.style.display != DisplayStyle.None) continue;
                    throw new InvalidOperationException("Control escaped letterboxed content: " + control.text);
                }
                if (overlay.style.display != DisplayStyle.None && dialogScroll != null && dialogScroll.Contains(control) && !DialogBounds().Contains(bounds.center)) continue;
                Vector2 panelPoint = RuntimePanelUtils.ScreenToPanel(root.panel, bounds.center);
                float inputError = Vector2.Distance(panelPoint, control.worldBound.center);
                if (inputError > 1)
                    throw new InvalidOperationException("Screen input scale/offset mismatch: " + control.text + " physicalPixels=" + inputError);
                VisualElement picked = root.panel.Pick(panelPoint);
                while (picked != null && picked != control) picked = picked.parent;
                if (picked != control) throw new InvalidOperationException("Mapped pointer missed its visible control: " + control.text);
                checkedControls++;
            }
            if (checkedControls == 0) throw new InvalidOperationException("No actual panel control was checked for input mapping");
            foreach (Vector2 margin in new[] { new Vector2(content.xMin / 2, Screen.height / 2f), new Vector2((content.xMax + Screen.width) / 2, Screen.height / 2f),
                new Vector2(Screen.width / 2f, content.yMin / 2), new Vector2(Screen.width / 2f, (content.yMax + Screen.height) / 2) })
            {
                if (content.Contains(margin)) continue;
                VisualElement picked = root.panel.Pick(RuntimePanelUtils.ScreenToPanel(root.panel, margin));
                while (picked != null)
                {
                    if (picked is Button) throw new InvalidOperationException("Letterbox margin picked a game control");
                    picked = picked.parent;
                }
            }
        }

        public void AssertCrewLayout()
        {
            for (int floor = State.viewport; floor < Math.Min(7,State.viewport + VisibleFloorCount); floor++)
                if (State.levels[floor] > 0) game.Perspective.AssertDepartment(floor);
        }

        internal Rect[] LogicalLayoutSnapshot(List<string> descriptions = null)
        {
            var elements = new List<VisualElement>();
            foreach (string name in new[] { "header", "operations", "dock", "world", "shaft", "floors" }) elements.Add(root.Q(name));
            foreach (VisualElement landing in landings) if (landing != null) elements.Add(landing);
            elements.Add(compilerPhase);
            elements.Add(compilerMachine);
            foreach (Button control in root.Query<Button>().ToList())
                if (!overlay.Contains(control) && Displayed(control)) elements.Add(control);
            foreach (Label readout in readouts) if (Displayed(readout)) elements.Add(readout);
            var bounds = new List<Rect>();
            float scale = ViewportScale(Screen.width, Screen.height);
            foreach (VisualElement element in elements)
            {
                Rect box = element.worldBound;
                box.position = (box.position - root.worldBound.position) / scale;
                box.size /= scale;
                bounds.Add(box);
                descriptions?.Add(element.GetType().Name + " name=" + element.name + " classes=" + string.Join(",", element.GetClasses())
                    + " text=" + (element is TextElement text ? text.text.Replace("\n", "\\n") : ""));
            }
            return bounds.ToArray();
        }

        private void Press(string title)
        {
            var control = root.Query<Button>().ToList().Find(item => (item.text == title || title == "OPTIONS" && item.ClassListContains("floor-options")) && item.enabledInHierarchy && item.resolvedStyle.display != DisplayStyle.None);
            if (control == null) throw new InvalidOperationException("UI control unavailable: " + title
                + "; viewport=" + State.viewport + "; pending=" + State.PendingChallenge + "; overlay=" + overlay.style.display
                + "; controls=" + string.Join(" | ", root.Query<Button>().ToList().ConvertAll(item => item.text.Replace("\n", " / ")
                    + " enabled=" + item.enabledInHierarchy + " display=" + item.resolvedStyle.display)));
            using (var submit = NavigationSubmitEvent.GetPooled())
            {
                submit.target = control;
                control.SendEvent(submit);
            }
        }

        public IEnumerator CheckInteractions()
        {
            var checks = InteractionSteps();
            while (true)
            {
                bool next;
                try { next = checks.MoveNext(); }
                catch (Exception exception)
                {
                    Debug.LogError("MATHSCRIPT_UI_MOTION_FAIL " + exception);
                    Application.Quit(1);
                    yield break;
                }
                if (!next) yield break;
                yield return checks.Current;
            }
        }

        private IEnumerator InteractionSteps()
        {
            var previous = game.State;
            game.ReplaceState(MathscriptEconomy.CreateCompany());
            Refresh();
            yield return null;
            yield return new WaitForEndOfFrame();
            AssertLayout();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-commissioning.png"));
            yield return new WaitForSeconds(0.2f);
            Press("+ BUILD DEPARTMENT  /  $10");
            if (State.levels[0] != 1 || State.coins != 0 || State.FloorBin != 0)
                throw new InvalidOperationException("First-department construction did not charge ten coins once");
            Refresh();
            yield return null;
            Press("GENERATE");
            if (State.FloorBin != 7.5 || State.coins != 0)
                throw new InvalidOperationException("Commissioned department did not enable resource production");
            Debug.Log("MATHSCRIPT_COMMISSIONING_UI_PASS");
            workStarted[0] = -100;
            game.ReplaceState(new MathscriptEconomy());
            Refresh();
            yield return null;
            AssertLayout();
            Press("HIRE\n$48");
            if (!State.hired[0] || State.coins != 952) throw new InvalidOperationException("Recommended hiring did not automate the first floor once");
            game.ReplaceState(new MathscriptEconomy { coins = 0 });
            Refresh();
            if (invest.enabledSelf) throw new InvalidOperationException("Unaffordable investment enabled");
            game.ReplaceState(new MathscriptEconomy());
            Refresh();
            yield return null;
            yield return new WaitForEndOfFrame();
            var baseline = Frame();
            Vector3 workerBefore = game.Perspective.WorkerPosition(0);
            Press("GENERATE");
            if (State.bins[0] != 7.5) throw new InvalidOperationException("Generate UI did not produce RC");
            yield return new WaitForSeconds(1.1f);
            yield return new WaitForEndOfFrame();
            if (Vector3.Distance(workerBefore, game.Perspective.WorkerPosition(0)) < 0.4f) throw new InvalidOperationException("Manual 3D worker did not travel");
            var manualRegion = root.Q("world").worldBound;
            AssertMotion(baseline, Frame(), manualRegion, "manual-generate");
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-manual-motion.png"));
            Press("OPTIONS");
            yield return null;
            Press("HIRE MANAGER  /  $48");
            if (!State.hired[0]) throw new InvalidOperationException("Hire UI did not hire manager");
            Press("UPGRADE +1  /  $11");
            if (State.levels[0] != 2 || !challengeDialog) throw new InvalidOperationException("Upgrade UI did not open bonus");
            using (var tab = KeyDownEvent.GetPooled(new Event { type = EventType.KeyDown, keyCode = KeyCode.Tab }))
            {
                tab.target = dialog.Q<Button>();
                dialog.SendEvent(tab);
            }
            Press("12");
            if (State.PendingChallenge >= 0 || overlay.style.display != DisplayStyle.None) throw new InvalidOperationException("Bonus UI did not resolve");
            Press("OPTIONS");
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-floor-options.png"));
            using (var escape = KeyDownEvent.GetPooled(new Event { type = EventType.KeyDown, keyCode = KeyCode.Escape }))
            {
                escape.target = dialog.Q<Button>();
                dialog.SendEvent(escape);
            }
            if (overlay.style.display != DisplayStyle.None) throw new InvalidOperationException("Escape did not close options");
            Press("BUS OPTIONS");
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-bus-options.png"));
            Press("CLOSE");
            Press("v");
            if (State.viewport != 1) throw new InvalidOperationException("Floor navigation UI failed");
            Press("^");
            Press("SEND");
            if (State.busState == "IDLE") throw new InvalidOperationException("Send UI did not dispatch");
            yield return new WaitForSeconds(0.15f);
            yield return new WaitForEndOfFrame();
            var busBefore = Frame();
            Vector3 busStart = game.Perspective.LiftPosition;
            yield return new WaitForSeconds(0.5f);
            yield return new WaitForEndOfFrame();
            if (Vector3.Distance(busStart, game.Perspective.LiftPosition) < 0.3f) throw new InvalidOperationException("3D bus actor did not travel: " + busStart + " to " + game.Perspective.LiftPosition);
            AssertMotion(busBefore, Frame(), root.Q("world").worldBound, "bus-travel");
            float loadingDeadline = Time.time + 8;
            while (State.busState != "LOADING" && Time.time < loadingDeadline) yield return null;
            if (State.busState != "LOADING") throw new InvalidOperationException("Bus did not reach loading phase");
            yield return new WaitForEndOfFrame();
            var loadingBefore = Frame();
            Vector3 loadingStart = game.Perspective.DeliveryPosition;
            yield return new WaitForSeconds(0.12f);
            yield return new WaitForEndOfFrame();
            if (Vector3.Distance(loadingStart, game.Perspective.DeliveryPosition) < 0.15f) throw new InvalidOperationException("3D loading packet did not move");
            Rect loadingRegion = root.Q("world").worldBound;
            if (State.busState != "LOADING" || !game.Perspective.DeliveryVisible) throw new InvalidOperationException("3D loading packet disappeared during capture");
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-bus-motion.png"));
            AssertMotion(loadingBefore, Frame(), loadingRegion, "bus-loading");
            while (State.busState != "UNLOADING") yield return null;
            yield return new WaitForEndOfFrame();
            var unloadBefore = Frame();
            yield return new WaitForSeconds(0.15f);
            yield return new WaitForEndOfFrame();
            AssertMotion(unloadBefore, Frame(), root.Q("screen").worldBound, "bus-unloading");
            while (State.busState != "IDLE") yield return null;
            Refresh();
            Press("COMPILE");
            if (State.compilerState == "IDLE") throw new InvalidOperationException("Compile UI did not start");
            yield return new WaitForEndOfFrame();
            var fetchBefore = Frame();
            yield return new WaitForSeconds(0.3f);
            yield return new WaitForEndOfFrame();
            AssertMotion(fetchBefore, Frame(), root.Q("screen").worldBound, "compiler-fetch");
            yield return new WaitForSeconds(0.5f);
            yield return new WaitForEndOfFrame();
            var compilerBefore = Frame();
            yield return new WaitForSeconds(0.35f);
            yield return new WaitForEndOfFrame();
            AssertMotion(compilerBefore, Frame(), compilerMachine.worldBound, "compiler-processing");
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-compiler-motion.png"));
            while (State.compilerState != "IDLE") yield return null;
            if (State.compiledRC <= 0) throw new InvalidOperationException("Compile UI did not pay");
            State.coins = 100000;
            State.lifetime = 40000;
            Press("OPTIONS");
            Press("ACTIVATE SKILL");
            if (!State.SkillActive(0)) throw new InvalidOperationException("Manager skill UI did not activate");
            Press("CLOSE");
            Press("COMPANY");
            yield return null;
            Press("Parallel algorithms / $2,500");
            if (!State.research[0]) throw new InvalidOperationException("Research UI did not purchase");
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-company.png"));
            yield return CheckQuestTeaching();
            yield return null;
            Press("PRIME REFACTOR / +2 TOKENS");
            Press("CANCEL");
            if (State.refactors != 0) throw new InvalidOperationException("Prestige cancellation mutated state");
            yield return null;
            Press("PRIME REFACTOR / +2 TOKENS");
            Press("REFACTOR");
            if (State.refactors != 1 || State.claimedTokens != 2 || !State.research[0]) throw new InvalidOperationException("Prestige UI did not preserve permanent progression");
            Debug.Log("MATHSCRIPT_PROGRESSION_UI_PASS");
            yield return CheckContractInteractions();
            game.ReplaceState(previous);
            shownViewport = -1;
            Refresh();
            Debug.Log("MATHSCRIPT_UI_INTERACTIONS_PASS");
        }

        private IEnumerator CheckQuestTeaching()
        {
            var previous = State;
            var fixture = new MathscriptEconomy { compiledRC = 3, busManager = true, compilerManager = true, refactors = 1 };
            game.ReplaceState(fixture);
            for (int quest = 0; quest < 3; quest++)
            {
                OpenCompany();
                Refresh();
                Press(MathscriptEconomy.QuestNames[quest]);
                yield return null;
                if (dialog.Q<Label>("quest-feedback").text != "" || dialog.Q("quest-illustration").style.display != DisplayStyle.None)
                    throw new InvalidOperationException("Quest leaked its solution before an answer");
                double cash = State.coins;
                Press("BACK");
                if (State.coins != cash || State.questsDone[quest]) throw new InvalidOperationException("Quest back granted a reward");
                Press(MathscriptEconomy.QuestNames[quest]);
                using (var escape = KeyDownEvent.GetPooled(new Event { type = EventType.KeyDown, keyCode = KeyCode.Escape }))
                {
                    escape.target = dialog.Q<Button>();
                    dialog.SendEvent(escape);
                }
                if (State.coins != cash || State.questsDone[quest] || overlay.style.display != DisplayStyle.None)
                    throw new InvalidOperationException("Quest Escape did not skip without reward");
                OpenCompany();
                Refresh();
                Press(MathscriptEconomy.QuestNames[quest]);
                Press(MathscriptEconomy.QuestChoices[quest][(MathscriptEconomy.QuestAnswers[quest] + 1) % 3]);
                if (State.coins != cash || State.questsDone[quest] || dialog.Q<Label>("quest-feedback").text != MathscriptEconomy.QuestHints[quest]
                    || dialog.Q("quest-illustration").style.display != DisplayStyle.None)
                    throw new InvalidOperationException("Wrong quest answer did not show a hint without reward");
                var correct = dialog.Query<Button>(className: "quest-answer").ToList()[MathscriptEconomy.QuestAnswers[quest]];
                correct.Focus();
                Press(correct.text);
                if (!State.questsDone[quest] || State.coins != cash + MathscriptEconomy.QuestRewards[quest]
                    || dialog.Q<Label>("quest-feedback").text != MathscriptEconomy.QuestExplanations[quest]
                    || dialog.Q<Label>("quest-reward").text != "Awarded: " + MathscriptNumber.Money(MathscriptEconomy.QuestRewards[quest])
                    || dialog.Query<Button>(className: "quest-answer").ToList().Exists(answer => answer.enabledInHierarchy))
                    throw new InvalidOperationException("Correct quest answer lost its explanation, exact reward or disabled state");
                yield return null;
                if (root.focusController.focusedElement != dialog.Query<Button>().ToList().Find(answer => answer.text == "CONTINUE"))
                    throw new InvalidOperationException("Disabled quest answer retained focus");
                yield return new WaitForEndOfFrame();
                ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-quest-solution-" + quest + ".png"));
                cash = State.coins;
                using (var replay = NavigationSubmitEvent.GetPooled())
                {
                    replay.target = correct;
                    correct.SendEvent(replay);
                }
                if (State.coins != cash) throw new InvalidOperationException("Disabled answer replayed a reward");
                Press("CONTINUE");
                Refresh();
                if (dialog.Q<Label>(className: "dialog-title").text != "COMPANY DEVELOPMENT")
                    throw new InvalidOperationException("Quest continue did not return to company");
                AssertQuestReload(quest, cash);
                var reopen = dialog.Query<Button>().ToList().Find(answer => answer.text == MathscriptEconomy.QuestNames[quest]);
                if (reopen == null || reopen.enabledInHierarchy) throw new InvalidOperationException("Completed company quest remained enabled");
            }
            game.ReplaceState(previous);
            OpenCompany();
            Refresh();
            Debug.Log("MATHSCRIPT_QUEST_TEACHING_PASS hints / explanations / exact rewards / focus / continue / no replay");
        }

        private void AssertQuestReload(int quest, double cash)
        {
            string path = System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-quest-check-" + Guid.NewGuid().ToString("N") + ".json");
            try
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                MathscriptSave.Write(path, State, now);
                var restored = MathscriptSave.Read(path, now, out double offline);
                if (!restored.questsDone[quest] || offline != 0 || restored.AnswerQuest(quest, MathscriptEconomy.QuestAnswers[quest]) || restored.coins != cash)
                    throw new InvalidOperationException("Saved quest completion replayed a reward");
                game.ReplaceState(restored);
                OpenQuest(quest);
                if (dialog.Q<Label>("quest-feedback").text != MathscriptEconomy.QuestExplanations[quest]
                    || dialog.Query<Button>(className: "quest-answer").ToList().Exists(answer => answer.enabledInHierarchy)
                    || dialog.Q<Label>("quest-reward").text != "Previously awarded: " + MathscriptNumber.Money(MathscriptEconomy.QuestRewards[quest]))
                    throw new InvalidOperationException("Restored quest lost its read-only worked solution");
                Press("CONTINUE");
                Refresh();
            }
            finally
            {
                System.IO.File.Delete(path);
                System.IO.File.Delete(path + ".tmp");
            }
        }

#if UNITY_EDITOR
        public static void RunFixedLayoutChecks()
        {
            var sizes = new[] { new Vector2Int(1280, 800), new Vector2Int(390, 844), new Vector2Int(844, 390), new Vector2Int(1920, 800), new Vector2Int(800, 1280), new Vector2Int(320, 568), new Vector2Int(430, 932) };
            var expected = new[] { new Rect(0, 40, 1280, 720), new Rect(0, 0, 390, 844), new Rect(0, 0, 844, 390), new Rect(248.888889f, 0, 1422.222222f, 800), new Rect(0, 0, 800, 1280), new Rect(0, 0, 320, 568), new Rect(0, 0, 430, 932) };
            Rect control = new Rect(48, 208, 208, 44);
            for (int index = 0; index < sizes.Length; index++)
            {
                Vector2Int size = sizes[index];
                Rect content = ContentBounds(size.x, size.y);
                if (Vector2.Distance(content.position, expected[index].position) > 0.01f || Vector2.Distance(content.size, expected[index].size) > 0.01f)
                    throw new InvalidOperationException("Responsive viewport bounds mismatch: " + size);
                Rect mapped = LogicalToScreen(control, size.x, size.y);
                if (!content.Contains(mapped.min) || !content.Contains(mapped.max) || Mathf.Abs(mapped.width / mapped.height - control.width / control.height) > 0.001f
                    || Vector2.Distance(ScreenToLogical(mapped.center, size.x, size.y), control.center) > 0.01f)
                    throw new InvalidOperationException("Fixed landscape control/input mapping mismatch: " + size);
                    if (IsPortraitViewport(size.x, size.y) && 66 * ViewportScale(size.x, size.y) < 44)
                        throw new InvalidOperationException("Portrait touch target is smaller than 44 pixels: " + size);
            }
                    Debug.Log("MATHSCRIPT_FIXED_LAYOUT_MAPPING_PASS responsive portrait / unchanged landscape / input round trip / 44px phone targets");
        }

        public static void RunPresentationChecks()
        {
            var setup = UnityEditor.SceneManagement.EditorSceneManager.GetSceneManagerSetup();
            UnityEditor.SceneManagement.EditorSceneManager.NewScene(UnityEditor.SceneManagement.NewSceneSetup.EmptyScene, UnityEditor.SceneManagement.NewSceneMode.Single);
            try
            {
                var host = new GameObject("Data center presentation fixture");
                var owner = host.AddComponent<MathscriptIdleMiner>();
                var flags = System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic;
                typeof(MathscriptIdleMiner).GetField("smoke", flags).SetValue(owner, true);
                owner.towerShader = Shader.Find("Standard");
                owner.ReplaceState(new MathscriptEconomy());
                typeof(MathscriptIdleMiner).GetMethod("CreateTower", flags).Invoke(owner, null);
                var world = host.AddComponent<MathscriptPerspective>();
                world.Initialize(owner);
                typeof(MathscriptIdleMiner).GetField("<Perspective>k__BackingField", flags).SetValue(owner, world);
                var ui = host.AddComponent<MathscriptTycoonUI>();
                ui.Initialize(owner);
                for (int floor = 0; floor < 7; floor++)
                {
                    owner.State.viewport = floor;
                    for (int built = 0; built < 7; built++) owner.State.levels[built] = built < floor ? 1 : 0;
                    owner.State.bins[floor] = 0;
                    typeof(MathscriptPerspective).GetMethod("Update", flags).Invoke(world, null);
                    world.AssertDepartment(floor);
                    owner.State.levels[floor] = 1;
                    typeof(MathscriptPerspective).GetMethod("Update", flags).Invoke(world, null);
                    world.AssertDepartment(floor);
                    owner.State.bins[floor] = 12;
                    owner.State.hired[floor] = true;
                    owner.State.levels[floor] = 50;
                    typeof(MathscriptPerspective).GetMethod("Update", flags).Invoke(world, null);
                    world.AssertDepartment(floor);
                    owner.State.hired[floor] = false;
                }
                double bulkPrice = 11;
                for (int level = 2; level <= 50; level++) bulkPrice += Math.Ceiling(8 * Math.Pow(1.15, level));
                owner.ReplaceState(new MathscriptEconomy { coins = bulkPrice - 1 });
                ui.OpenFloor(0);
                ui.Refresh();
                ui.Press("x50");
                var bulkUpgrade = ui.dialog.Q<Button>(className: "invest");
                if (bulkUpgrade.enabledInHierarchy || bulkUpgrade.text != "UPGRADE  /  NEED $" + Number(bulkPrice)
                    || owner.State.levels[0] != 1 || owner.State.coins != bulkPrice - 1)
                    throw new InvalidOperationException("Unaffordable x50 mode did not show its complete price without purchasing");
                owner.State.coins = bulkPrice;
                ui.Refresh();
                ui.Press(bulkUpgrade.text);
                if (owner.State.levels[0] != 51 || owner.State.coins != 0)
                    throw new InvalidOperationException("x50 mode did not purchase exactly fifty levels at its quoted price");
                ui.bulk = 1;
                ui.CloseDialog();
                Debug.Log("MATHSCRIPT_BULK_UPGRADE_UI_PASS x50 / complete quote / affordability / exact purchase");
                for (int quest = 0; quest < 3; quest++)
                {
                    owner.ReplaceState(new MathscriptEconomy());
                    ui.OpenQuest(quest);
                    ui.Refresh();
                    if (ui.dialog.Query<Button>(className: "quest-answer").ToList().Exists(answer => answer.enabledInHierarchy))
                        throw new InvalidOperationException("Unavailable quest has enabled answers");
                    owner.ReplaceState(new MathscriptEconomy { compiledRC = 3, busManager = true, compilerManager = true, refactors = 1 });
                    ui.OpenCompany();
                    ui.Refresh();
                    ui.Press(MathscriptEconomy.QuestNames[quest]);
                    double cash = owner.State.coins;
                    if (ui.dialog.Q<Label>("quest-feedback").text != "" || ui.dialog.Q("quest-illustration").style.display != DisplayStyle.None)
                        throw new InvalidOperationException("Quest solution visible before answering");
                    ui.Press(MathscriptEconomy.QuestChoices[quest][(MathscriptEconomy.QuestAnswers[quest] + 1) % 3]);
                    if (owner.State.coins != cash || owner.State.questsDone[quest] || ui.dialog.Q<Label>("quest-feedback").text != MathscriptEconomy.QuestHints[quest])
                        throw new InvalidOperationException("Wrong quest answer did not preserve cash and show its hint");
                    var correct = ui.dialog.Query<Button>(className: "quest-answer").ToList()[MathscriptEconomy.QuestAnswers[quest]];
                    ui.Press(correct.text);
                    if (!owner.State.questsDone[quest] || owner.State.coins != cash + MathscriptEconomy.QuestRewards[quest]
                        || ui.dialog.Q<Label>("quest-feedback").text != MathscriptEconomy.QuestExplanations[quest]
                        || ui.dialog.Q<Label>("quest-reward").text != "Awarded: " + MathscriptNumber.Money(MathscriptEconomy.QuestRewards[quest])
                        || ui.dialog.Q("quest-illustration").style.display != DisplayStyle.Flex
                        || ui.dialog.Query<Button>(className: "quest-answer").ToList().Exists(answer => answer.enabledInHierarchy))
                        throw new InvalidOperationException("Correct quest answer did not retain worked feedback and disable answers");
                    cash = owner.State.coins;
                    using (var replay = NavigationSubmitEvent.GetPooled())
                    {
                        replay.target = correct;
                        correct.SendEvent(replay);
                    }
                    if (owner.State.coins != cash) throw new InvalidOperationException("Disabled quest answer replayed its reward");
                    ui.Press("CONTINUE");
                    if (ui.dialog.Q<Label>(className: "dialog-title").text != "COMPANY DEVELOPMENT")
                        throw new InvalidOperationException("Quest continuation left the company view");
                    ui.AssertQuestReload(quest, cash);
                }
                Debug.Log("MATHSCRIPT_DATA_CENTER_PRESENTATION_PASS seven silhouettes / module budgets / stock indicators / three quest hints / worked solutions / continuation / v3 disk no replay");
            }
            finally
            {
                if (Array.Exists(setup, scene => scene.isActive && scene.isLoaded)) UnityEditor.SceneManagement.EditorSceneManager.RestoreSceneManagerSetup(setup);
                else UnityEditor.SceneManagement.EditorSceneManager.NewScene(UnityEditor.SceneManagement.NewSceneSetup.EmptyScene, UnityEditor.SceneManagement.NewSceneMode.Single);
            }
        }
#endif

        internal IEnumerator CheckViewportDialogs()
        {
            OpenCompany();
            Refresh();
            yield return new WaitForEndOfFrame();
            AssertLayout();
            Press("CLOSE");
            int previousBulk = bulk;
            OpenFloor(State.viewport);
            Refresh();
            Press("x50");
            yield return new WaitForEndOfFrame();
            AssertLayout();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-floor-options-x50-" + Screen.width + "x" + Screen.height + ".png"));
            Press("CLOSE");
            bulk = previousBulk;
            OpenSector(false);
            Refresh();
            yield return new WaitForEndOfFrame();
            AssertLayout();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-compiler-options-" + Screen.width + "x" + Screen.height + ".png"));
            Press("CLOSE");
            Refresh();
            yield return new WaitForEndOfFrame();
            AssertLayout();
            Debug.Log("MATHSCRIPT_FIXED_LAYOUT_DIALOG_PASS size=" + Screen.width + "x" + Screen.height + " company/floor-x50/compiler / panel picking / letterbox rejects controls");
        }

        public IEnumerator CheckPerspective()
        {
            ConfigureWorld();
            yield return new WaitForSeconds(0.2f);
            Generate(State.viewport);
            yield return new WaitForSeconds(0.15f);
            yield return new WaitForEndOfFrame();
            var before = Frame();
            var camera = GameObject.Find("Perspective Camera").GetComponent<Camera>();
            if (!camera.enabled || !camera.orthographic || root.ClassListContains("perspective") == false) throw new InvalidOperationException("Mine cutaway world not enabled");
            AssertLayout();
            int lit = 0;
            var pixels = before.GetPixels32();
            Rect rendered = camera.pixelRect;
            int left = Mathf.Clamp(Mathf.CeilToInt(rendered.xMin), 0, Screen.width - 1);
            int right = Mathf.Clamp(Mathf.FloorToInt(rendered.xMax), left + 1, Screen.width);
            int bottom = Mathf.Clamp(Mathf.CeilToInt(rendered.yMin), 0, Screen.height - 1);
            int top = Mathf.Clamp(Mathf.FloorToInt(rendered.yMax), bottom + 1, Screen.height);
            for (int vertical = bottom; vertical < top; vertical++)
                for (int horizontal = left; horizontal < right; horizontal++)
                {
                    var pixel = pixels[vertical * Screen.width + horizontal];
                    if (pixel.r > 65 || pixel.g > 75 || pixel.b > 85) lit++;
                }
            if (lit < (right - left) * (top - bottom) / 10) throw new InvalidOperationException("Perspective world is blank inside its letterboxed camera bounds");
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.temporaryCachePath, "mathscript-perspective-" + Screen.width + "x" + Screen.height + ".png"));
            yield return new WaitForSeconds(0.9f);
            yield return new WaitForEndOfFrame();
            AssertMotion(before, Frame(), root.Q("world").worldBound, "perspective-crew");
            Debug.Log("MATHSCRIPT_PERSPECTIVE_PASS");
        }

        private void OnDestroy() { if (panel != null) Destroy(panel); }

        [Serializable]
        public sealed class BrowserControl
        {
            public string text;
            public string tooltip;
            public bool enabled;
            public Rect bounds;
        }

        [Serializable]
        public sealed class BrowserReadout
        {
            public string name;
            public string text;
            public Rect bounds;
            public float textWidth;
        }

        private static bool Displayed(VisualElement element)
        {
            for (VisualElement ancestor = element; ancestor != null; ancestor = ancestor.parent)
                if (ancestor.resolvedStyle.display == DisplayStyle.None || ancestor.resolvedStyle.visibility == Visibility.Hidden) return false;
            return element.worldBound.width > 0 && element.worldBound.height > 0;
        }

        internal BrowserReadout[] BrowserReadouts()
        {
            var values = new List<BrowserReadout>();
            float scale = ViewportScale(Screen.width, Screen.height);
            var labels = new List<Label>(readouts);
            foreach (string name in new[] { "quest-feedback", "quest-reward" })
            {
                Label label = root.Q<Label>(name);
                if (label != null) labels.Add(label);
            }
            foreach (Label label in labels)
            {
                if (!Displayed(label)) continue;
                Rect box = label.worldBound;
                bool teaching = label.name == "quest-feedback" || label.name == "quest-reward";
                Vector2 size = label.MeasureTextSize(label.text, teaching ? box.width / scale : 0, teaching ? VisualElement.MeasureMode.AtMost : VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined);
                values.Add(new BrowserReadout { name = label.name, text = label.text, bounds = ScreenBounds(label), textWidth = size.x * scale });
            }
            return values.ToArray();
        }

        internal Rect DialogBounds()
        {
            if (overlay.style.display == DisplayStyle.None || dialogScroll == null) return Rect.zero;
            return ScreenBounds(dialogScroll.contentViewport);
        }

        internal BrowserControl[] BrowserControls()
        {
            var controls = new List<BrowserControl>();
            foreach (var control in root.Query<Button>().ToList())
            {
                if (!Displayed(control)) continue;
                controls.Add(new BrowserControl { text = control.text, tooltip = control.tooltip, enabled = control.enabledInHierarchy,
                    bounds = ScreenBounds(control) });
            }
            return controls.ToArray();
        }
    }
}