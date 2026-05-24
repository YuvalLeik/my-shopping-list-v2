"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./hooks/useAuth";
import { useGroceryList } from "./hooks/useGroceryList";
import { useAutoComplete } from "./hooks/useAutoComplete";
import { useSmartSuggestions } from "./hooks/useSmartSuggestions";
import { useShoppingMode } from "./hooks/useShoppingMode";
import ListHeader from "./components/ListHeader";
import QuickAddInput from "./components/QuickAddInput";
import AddItemForm from "./components/AddItemForm";
import SuggestionBar from "./components/SuggestionBar";
import SearchAndSort from "./components/SearchAndSort";
import ItemList from "./components/ItemList";
import ShoppingModeView from "./components/ShoppingModeView";
import HistoricalLists from "./components/HistoricalLists";
import ViewListModal from "./components/ViewListModal";
import ChatBot from "./components/ChatBot";
import BottomNav from "./components/BottomNav";
import Dashboard from "./components/Dashboard";
import PriceEntryModal from "./components/PriceEntryModal";
import { GroceryList } from "./types";

type MobileTab = "list" | "history" | "suggestions" | "dashboard";

export default function Home() {
  const { user, loading } = useAuth();
  const grocery = useGroceryList(user);
  const { allItemNamesWithCategory, getSuggestions } = useAutoComplete(
    grocery.items,
    grocery.completedLists,
    user
  );

  const smartSuggestions = useSmartSuggestions(grocery.items, user);
  const shoppingMode = useShoppingMode(grocery.items);

  const [viewingList, setViewingList] = useState<GroceryList | null>(null);
  const [showChatBot, setShowChatBot] = useState(false);
  const [showDetailedForm, setShowDetailedForm] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("list");

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">טוען...</div>
      </div>
    );
  }

  if (shoppingMode.isShoppingMode && grocery.items.length > 0) {
    return (
      <ShoppingModeView
        groupedItems={shoppingMode.groupedItems}
        progress={shoppingMode.progress}
        onTogglePurchased={grocery.togglePurchased}
        onCompleteList={grocery.completeList}
        onExitShoppingMode={shoppingMode.toggleShoppingMode}
      />
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-4 px-2 sm:py-8 sm:px-4 pb-20 lg:pb-4">
      <div className="grocery-bg" />

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Desktop top tab bar — elegant underline style */}
        <div className="hidden lg:flex mb-6 items-center justify-center gap-8 border-b border-gray-200">
          {([
            { id: "list", label: "רשימה", icon: "📝" },
            { id: "dashboard", label: "מחירים ודאשבורד", icon: "📊" },
          ] as { id: MobileTab; label: string; icon: string }[]).map((t) => {
            const isActive =
              mobileTab === t.id ||
              (t.id === "list" && mobileTab !== "dashboard");
            return (
              <button
                key={t.id}
                onClick={() => setMobileTab(t.id)}
                className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-blue-600"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                <span className="ml-1.5">{t.icon}</span>
                {t.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 rounded-t" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Main Content — always visible on desktop, tab-controlled on mobile */}
          <div
            className={`lg:col-span-3 order-1 ${
              mobileTab !== "list" ? "hidden lg:block" : ""
            } ${mobileTab === "dashboard" ? "lg:hidden" : ""}`}
          >
            <ListHeader
              currentDate={grocery.currentDate}
              onChangeDate={grocery.changeDate}
              itemCount={grocery.items.length}
              onEnterShoppingMode={shoppingMode.toggleShoppingMode}
            />

            <QuickAddInput
              onAddItem={grocery.addItem}
              getSuggestions={getSuggestions}
              allAutoCompleteItems={allItemNamesWithCategory}
              onExpandForm={() => setShowDetailedForm(!showDetailedForm)}
            />

            {showDetailedForm && (
              <AddItemForm
                onAddItem={grocery.addItem}
                getSuggestions={getSuggestions}
              />
            )}

            {/* Suggestions inline on desktop, own tab on mobile */}
            <div className="hidden lg:block">
              <SuggestionBar
                suggestions={smartSuggestions.suggestions}
                isLoading={smartSuggestions.isLoading}
                onAddSuggestion={(name, category) =>
                  grocery.addItem(name, category)
                }
                onDismiss={smartSuggestions.dismissSuggestion}
              />
            </div>

            <SearchAndSort
              searchQuery={grocery.searchQuery}
              onSearchChange={grocery.setSearchQuery}
              sortOption={grocery.sortOption}
              onSortChange={grocery.setSortOption}
              purchasedCount={grocery.purchasedCount}
              totalCount={grocery.items.length}
              allPurchased={grocery.allPurchased}
              onClearPurchased={grocery.clearPurchased}
              onCompleteList={grocery.completeList}
            />

            {grocery.items.length > 0 && (
              <button
                onClick={() => setShowPriceModal(true)}
                className="mb-3 w-full rounded-xl border border-green-200 bg-green-50 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors"
              >
                הוסף מחירים לרשימה
              </button>
            )}

            <ItemList
              items={grocery.filteredAndSortedItems}
              totalItemCount={grocery.items.length}
              allPurchased={grocery.allPurchased}
              onTogglePurchased={grocery.togglePurchased}
              onUpdateQuantity={grocery.updateQuantity}
              onDelete={grocery.deleteItem}
            />
          </div>

          {/* Suggestions tab — mobile only */}
          <div
            className={`lg:hidden order-2 ${
              mobileTab !== "suggestions" ? "hidden" : ""
            }`}
          >
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              הצעות חכמות
            </h2>
            {smartSuggestions.isLoading ? (
              <div className="rounded-xl border border-gray-200 bg-white/95 p-6 text-center text-gray-500">
                טוען הצעות...
              </div>
            ) : smartSuggestions.suggestions.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white/95 p-8 text-center">
                <div className="mb-3 text-4xl">💡</div>
                <p className="text-gray-500">
                  אין הצעות כרגע. ככל שתשתמשו יותר באפליקציה, כך ההצעות ישתפרו!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {smartSuggestions.suggestions.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{s.name}</div>
                      <div className="text-xs text-gray-500">
                        {s.reasonText}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          grocery.addItem(s.name, s.category)
                        }
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        הוסף
                      </button>
                      <button
                        onClick={() => smartSuggestions.dismissSuggestion(s.name)}
                        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* History — sidebar on desktop, tab on mobile */}
          <div
            className={`lg:col-span-1 order-3 lg:order-2 ${
              mobileTab !== "history" ? "hidden lg:block" : ""
            } ${mobileTab === "dashboard" ? "lg:hidden" : ""}`}
          >
            <div className="sticky top-4 sm:top-8">
              <HistoricalLists
                completedLists={grocery.completedLists}
                onSelectList={(list) => setViewingList(list)}
                onDeleteList={grocery.deleteList}
              />
            </div>
          </div>

          {/* Dashboard — shown when dashboard tab active */}
          <div
            className={`order-4 lg:col-span-4 ${
              mobileTab !== "dashboard" ? "hidden" : ""
            }`}
          >
            <div className="mb-4">
              <button
                onClick={() => setShowPriceModal(true)}
                disabled={grocery.items.length === 0}
                className="w-full rounded-xl bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40 shadow-sm"
              >
                הוסף מחירים לרשימה הנוכחית
              </button>
            </div>
            <Dashboard
              completedLists={grocery.completedLists}
              currentItems={grocery.items}
              onDeleteList={grocery.deleteList}
            />
          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <BottomNav
        activeTab={mobileTab}
        onTabChange={(tab) => setMobileTab(tab as MobileTab)}
        itemCount={grocery.items.length}
        historyCount={grocery.completedLists.length}
        suggestionCount={smartSuggestions.suggestions.length}
      />

      {viewingList && (
        <ViewListModal
          list={viewingList}
          onClose={() => setViewingList(null)}
        />
      )}

      <PriceEntryModal
        isOpen={showPriceModal}
        onClose={() => setShowPriceModal(false)}
        items={grocery.items}
        listId={grocery.listId}
        onPricesApplied={() => {
          grocery.loadData();
          setShowPriceModal(false);
        }}
      />

      {showChatBot && (
        <ChatBot
          currentItems={grocery.items}
          completedLists={grocery.completedLists}
          onAddItems={grocery.addItems}
          onClose={() => setShowChatBot(false)}
        />
      )}

      {!showChatBot && (
        <button
          onClick={() => setShowChatBot(true)}
          className="fixed bottom-20 lg:bottom-4 left-4 z-40 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:scale-110 active:scale-95"
          aria-label="פתח עוזר רשימת קניות"
          title="עוזר רשימת קניות"
        >
          <svg
            className="h-5 w-5 sm:h-6 sm:w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
