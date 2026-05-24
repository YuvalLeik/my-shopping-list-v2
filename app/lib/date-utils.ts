export const getTodayDate = () => {
  const today = new Date();
  return today.toISOString().split("T")[0];
};

export const formatDate = (dateString: string) => {
  if (!dateString) return "ללא תאריך";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return dateString;
  }
  return date.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};
