import Table from "./Table";
import Input from "./Input";
import { useState, useEffect } from "react";

function App() {
  const [results, setResults] = useState(null);

  useEffect(() => {
    window.ipcRenderer.on("scraping-done", (results: any) => {
      console.log("Scraping done:", results);
      setResults(results);
    });

    window.ipcRenderer.on("scraping-error", (error) => {
      console.error("Error during scraping:", error);
      // Handle error as needed
    });
  }, []);

  return (
    <div className="container mx-auto">
      <div className="flex justify-center items-center my-8">
        <div className="text-center"></div>
      </div>

      <div className="flex justify-center my-4">
        <Input />
      </div>
      <div className="flex justify-center items-center my-8">
        <Table places={results!} />
      </div>
    </div>
  );
}

export default App;
