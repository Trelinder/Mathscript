"""
Seed script to create Stripe products and prices.
Run manually: python backend/seed_products.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.stripe_client import get_stripe_client

def seed():
    client = get_stripe_client()

    existing = client.v1.products.search(params={"query": "name:'Math Quest Premium'"})
    if existing.data:
        print(f"Product already exists: {existing.data[0].id}")
        prices = client.v1.prices.list(params={"product": existing.data[0].id, "active": True})
        for p in prices.data:
            interval = p.recurring.interval if p.recurring else "one-time"
            print(f"  Price: {p.id} — ${p.unit_amount/100:.2f}/{interval}")
        return

    product = client.v1.products.create(params={
        "name": "Math Quest Premium",
        "description": "Unlimited math problems, AI stories, and voice narration for your child. No daily limits!",
        "metadata": {
            "app": "math_quest",
            "tier": "premium",
        },
    })
    print(f"Created product: {product.id}")

    monthly = client.v1.prices.create(params={
        "product": product.id,
        "unit_amount": 999,
        "currency": "usd",
        "recurring": {"interval": "month"},
        "metadata": {"plan": "monthly"},
    })
    print(f"Created monthly price: {monthly.id} — $9.99/month")

    yearly = client.v1.prices.create(params={
        "product": product.id,
        "unit_amount": 7999,
        "currency": "usd",
        "recurring": {"interval": "year"},
        "metadata": {"plan": "yearly"},
    })
    print(f"Created yearly price: {yearly.id} — $79.99/year")

if __name__ == "__main__":
    seed()
