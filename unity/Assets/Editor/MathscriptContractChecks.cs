using System;
using System.IO;
using System.Reflection;
using MathscriptPrototype;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UIElements;

public static class MathscriptContractChecks
{
    public static void Run()
    {
        CheckAllCompanies();
        var standard = new MathscriptEconomy { compilerBuffer = 3 };
        Require(standard.Compile(), "Standard sales remain available without a contract");
        standard.Tick(2.6);
        Require(standard.coins > 1000 && standard.compiledRC == 3 && standard.contracts.stagedRC == 0,
            "Non-contract batches retain the existing immediate payout");

        var state = new MathscriptEconomy();
        Require(!state.AcceptCompanyContract(-1) && !state.AcceptCompanyContract(3) && !state.AcceptCompanyContract(1),
            "Invalid or locked company offers cannot be accepted");
        Require(state.AcceptCompanyContract(0) && !state.AcceptCompanyContract(0) && !state.RequestContractPickup(),
            "Signing is one-time and empty docks cannot spawn pickups or pay");
        state.Generate(0);
        state.Generate(0);
        Require(state.SendBus(), "Contract cargo still starts with the actual elevator route");
        state.Tick(3.9);
        Require(state.compilerBuffer == 15 && state.contracts.stagedRC == 0 && state.coins == 1000,
            "Elevator delivery is unprocessed stock, not free contract cargo");
        state.tracks[3] = 4;
        Require(state.Compile(), "The processing center accepts delivered stock");
        state.Tick(2.6);
        Require(state.compiledRC == 15 && state.contracts.stagedRC == 12 && state.contracts.payloadRC == 0
            && state.contracts.truckState == "ARRIVING" && state.coins > 1000,
            "Processing stages only the quota, sells excess normally, and starts an approaching truck");
        double standardExcess = state.coins;
        Require(!state.RequestContractPickup() && !state.AcceptCompanyContract(0), "Repeated dispatch or sign clicks cannot duplicate a truck");
        state.Tick(MathscriptEconomy.TruckTravelSeconds);
        Require(state.contracts.truckState == "LOADING" && state.contracts.payloadRC == 6 && state.contracts.stagedRC == 6
            && state.coins == standardExcess, "Arrival reserves one real capacity-limited load without payout");
        Require(MathscriptSave.Valid(state), "A loading truck has a valid persistent state");

        var resumed = Clone(state);
        state.Tick(MathscriptEconomy.TruckLoadingSeconds + MathscriptEconomy.TruckTravelSeconds);
        resumed.Tick(MathscriptEconomy.TruckLoadingSeconds + MathscriptEconomy.TruckTravelSeconds);
        Require(JsonUtility.ToJson(state) == JsonUtility.ToJson(resumed), "Reloading a reserved load preserves phase, cargo and exact payout");
        Require(state.contracts.shipments == 1 && state.contracts.deliveredRC == 6 && state.contracts.remainingRC == 6
            && state.coins > standardExcess && state.contracts.truckState == "ARRIVING", "Departure pays once and remaining dock stock starts the next trip");
        state.Tick(8);
        Require(!state.HasCompanyContract && state.contracts.shipments == 2 && state.contracts.completed[0] == 1
            && state.contracts.deliveredRC == 12 && state.contracts.stagedRC == 0 && state.contracts.payloadRC == 0,
            "The final delivery fulfills the company contract and consumes all reserved cargo");
        double paid = state.coins;
        state.Tick(100);
        Require(state.coins == paid && state.contracts.completed[0] == 1 && state.contracts.shipments == 2,
            "Waiting cannot replay a shipment or completion bonus");
        Require(MathscriptSave.Valid(state) && state.AcceptCompanyContract(0), "Completed companies can renew with a fresh quota");
        state.compilerBuffer = 6;
        state.Compile();
        state.Tick(5.8);
        state.lifetime = 10000;
        Require(state.PrimeRefactor() && !state.HasCompanyContract && state.contracts.truckState == "IDLE"
            && state.contracts.completed[0] == 1 && state.contracts.deliveredRC == 12 && MathscriptSave.Valid(state),
            "Confirmed refactors clear undelivered freight while retaining completed company history");
        state.Tick(30);
        Require(state.coins == 1000 && state.contracts.shipments == 2, "Cancelled freight cannot pay after a refactor");

        var live = new MathscriptEconomy { busManager = true, compilerManager = true, savedAt = 1000000 };
        live.hired[0] = true;
        live.AcceptCompanyContract(0);
        var returned = Clone(live);
        double before = live.coins;
        live.Tick(60);
        Require(returned.ClaimOffline(1060000) == MathscriptEconomy.Round(live.coins - before)
            && JsonUtility.ToJson(returned.contracts) == JsonUtility.ToJson(live.contracts),
            "Offline contracts use the actual live pickup simulation");
        paid = returned.coins;
        Require(returned.ClaimOffline(1060000) == 0 && returned.coins == paid, "Offline deliveries cannot be claimed twice");

        string directory = Path.Combine(Path.GetTempPath(), "mathscript-contract-check-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            string path = Path.Combine(directory, "legacy.json");
            var legacy = new MathscriptEconomy { contracts = null, coins = 4321, savedAt = 1000000 };
            File.WriteAllText(path, JsonUtility.ToJson(legacy));
            var migrated = MathscriptSave.Read(path, 1000000, out _);
            Require(migrated.coins == 4321 && !migrated.HasCompanyContract && MathscriptSave.Valid(migrated),
                "Existing version-3 saves retain money and receive empty optional logistics state");
        }
        finally { Directory.Delete(directory, true); }
        CheckVehicle();
        Debug.Log("MATHSCRIPT_CONTRACT_PASS elevator/processing/cargo-conservation/capacity/one-payout/renewal/restart/offline/legacy");
    }

    private static void CheckAllCompanies()
    {
        for (int company = 0; company < MathscriptEconomy.CompanyNames.Length; company++)
        {
            var state = new MathscriptEconomy { compiledRC = MathscriptEconomy.CompanyUnlockRC[company], tracks = new[] { 0,0,0,100,0,0 } };
            double quota = MathscriptEconomy.CompanyQuotas[company];
            state.compilerBuffer = quota;
            Require(state.AcceptCompanyContract(company) && state.Compile(), "Each unlocked company accepts its real processing order");
            state.Tick(2.6);
            double reservedValue = state.contracts.stagedValue;
            Require(state.coins == 1000 && state.contracts.stagedRC == quota,
                "A fully contracted batch pays only after freight delivery for every company");
            double expectedPay = 0;
            int shipments = 0;
            while (state.HasCompanyContract && shipments < 30)
            {
                state.Tick(MathscriptEconomy.TruckTravelSeconds);
                Require(state.contracts.payloadRC > 0 && state.contracts.payloadRC <= MathscriptEconomy.CompanyTruckCapacity[company]
                    && MathscriptSave.Valid(state), "Every carrier respects its own truck capacity and persistent load");
                expectedPay = MathscriptEconomy.Round(expectedPay + MathscriptEconomy.Round(state.contracts.payloadValue * MathscriptEconomy.CompanyPremiums[company]));
                state.Tick(MathscriptEconomy.TruckLoadingSeconds + MathscriptEconomy.TruckTravelSeconds);
                shipments++;
            }
            expectedPay = MathscriptEconomy.Round(expectedPay + MathscriptEconomy.CompanyBonuses[company]);
            Require(!state.HasCompanyContract && state.contracts.completed[company] == 1 && state.contracts.deliveredRC == quota
                && state.contracts.earnings == expectedPay && state.coins == MathscriptEconomy.Round(1000 + expectedPay)
                && shipments == (int)Math.Ceiling(quota / MathscriptEconomy.CompanyTruckCapacity[company]),
                "Each company fulfills its exact quota with its premium and one completion bonus");
            Require(state.contracts.earnings >= reservedValue && MathscriptSave.Valid(state), "Completed larger contracts retain valid payout records");
        }
    }

    private static void CheckVehicle()
    {
        var setup = EditorSceneManager.GetSceneManagerSetup();
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        try
        {
            var game = new GameObject("Contract vehicle fixture").AddComponent<MathscriptIdleMiner>();
            game.towerShader = Shader.Find("Standard");
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            var state = new MathscriptEconomy { compilerBuffer = 12 };
            typeof(MathscriptIdleMiner).GetField("state",flags).SetValue(game,state);
            typeof(MathscriptIdleMiner).GetMethod("CreateTower",flags).Invoke(game,null);
            var world = game.gameObject.AddComponent<MathscriptPerspective>();
            world.Initialize(game);
            typeof(MathscriptIdleMiner).GetField("<Perspective>k__BackingField",flags).SetValue(game,world);
            var ui = game.gameObject.AddComponent<MathscriptTycoonUI>();
            ui.Initialize(game);
            var root = game.GetComponent<UIDocument>().rootVisualElement;
            Require(root.Q<Button>("company-contracts") != null, "A named contract control is visible at the processing dock");
            typeof(MathscriptTycoonUI).GetMethod("OpenContracts",flags).Invoke(ui,null);
            typeof(MathscriptTycoonUI).GetMethod("Refresh",flags).Invoke(ui,null);
            Require(root.Q<Button>("sign-contract-0").enabledSelf && !root.Q<Button>("sign-contract-1").enabledSelf,
                "The contract panel exposes the starter company and disables locked offers");
            typeof(MathscriptTycoonUI).GetMethod("CloseDialog",flags).Invoke(ui,null);
            var update = typeof(MathscriptPerspective).GetMethod("Update",flags);
            var read = typeof(MathscriptPerspective).GetMethod("ContractVisualState",flags);
            update.Invoke(world,null);
            Require(!ReadBool(read.Invoke(world,null),"truckVisible"), "An empty processing center does not show a phantom truck");
            state.AcceptCompanyContract(0);
            state.tracks[3] = 3;
            state.Compile();
            state.Tick(2.6);
            update.Invoke(world,null);
            typeof(MathscriptTycoonUI).GetMethod("Refresh",flags).Invoke(ui,null);
            Require(root.Q<Label>("contract-company").text == "Vector Labs" && root.Q<Label>("contract-trip").text.StartsWith("ARRIVING"),
                "Visible contract readouts match the active company and actual pickup phase");
            object arriving = read.Invoke(world,null);
            Vector3 before = (Vector3)arriving.GetType().GetField("truckPosition").GetValue(arriving);
            state.Tick(1.6);
            update.Invoke(world,null);
            object halfway = read.Invoke(world,null);
            Vector3 moved = (Vector3)halfway.GetType().GetField("truckPosition").GetValue(halfway);
            Require(ReadBool(halfway,"truckVisible") && Vector3.Distance(before,moved) > 1, "The actual company truck travels toward the processing center");
            state.Tick(2.4);
            update.Invoke(world,null);
            object loading = read.Invoke(world,null);
            Require(ReadBool(loading,"transferVisible") && (int)loading.GetType().GetField("loadedCrates").GetValue(loading) > 0,
                "Loading renders transferred crates rather than an empty decorative vehicle");
            state.Tick(0.8);
            update.Invoke(world,null);
            object departing = read.Invoke(world,null);
            Require(!ReadBool(departing,"transferVisible") && (int)departing.GetType().GetField("loadedCrates").GetValue(departing) == 2,
                "The departing truck visibly carries its reserved six-RC shipment");
            state.viewport = 3;
            update.Invoke(world,null);
            Require(!ReadBool(read.Invoke(world,null),"truckVisible"), "Surface freight does not overlay deep departments");
        }
        finally
        {
            if (Array.Exists(setup,scene => scene.isActive && scene.isLoaded)) EditorSceneManager.RestoreSceneManagerSetup(setup);
            else EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        }
    }

    private static bool ReadBool(object snapshot, string field) => (bool)snapshot.GetType().GetField(field).GetValue(snapshot);

    private static MathscriptEconomy Clone(MathscriptEconomy state) => JsonUtility.FromJson<MathscriptEconomy>(JsonUtility.ToJson(state));

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}