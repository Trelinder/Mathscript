using System;
using UnityEngine;
using MathscriptPrototype;

public static class PrototypeChecks
{
    public static void Run()
    {
        var state = new TycoonCore();
        Require(!state.BeginSale(), "Empty stock cannot sell");
        for (int step = 0; step < 10; step++) state.Tick(1f);
        Require(state.stock == 5 && state.coins == 0, "Production makes stock, not coins");
        Require(state.BeginSale() && state.stock == 0, "Sale reserves stock");
        Require(!state.BeginSale(), "Cannot overwrite an unanswered sale");
        Require(!state.Answer(14) && state.coins == 0, "Wrong answers do not pay");
        var restored = JsonUtility.FromJson<TycoonCore>(JsonUtility.ToJson(state));
        Require(restored.IsValid() && restored.ExpectedAnswer == 15, "Pending sale survives serialization");
        Require(restored.Answer(15) && restored.coins == 15, "Correct answer pays once");
        Require(!restored.Answer(15) && restored.coins == 15, "Repeated answer cannot pay");
        Require(restored.Upgrade() && restored.level == 2 && restored.coins == 0, "Upgrade consumes coins");
        Require(!restored.Upgrade(), "Insufficient coins cannot upgrade");
        for (int step = 0; step < 100; step++) restored.Tick(1f);
        Require(restored.stock == restored.Capacity, "Idle stock remains bounded");
        restored.Tick(float.NaN);
        Require(restored.IsValid(), "Invalid delta cannot corrupt save");
        Debug.Log("MATHSCRIPT_CORE_CHECKS_PASS");
    }

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }
}